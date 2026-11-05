import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admins, convites } from '../../src/infraestrutura/db/repositorios/convites.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { comDb, hashAleatorio } from './apoio.ts';

/**
 * Repositórios de convites, admins e auditoria (T23; ACE-39, ACE-40, ACE-42). Contra um banco
 * `teste_*` com o cenário de conta. Cada caso usa um grupo próprio com A e B como admins,
 * criado como superusuário, para as remoções não mudarem o cenário dos outros casos.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

let sequencia = 0;

/** Grupo novo criado por A, com A e B admins. */
async function grupoComDoisAdmins(): Promise<string> {
  const { db, cenario } = aberto;
  sequencia += 1;
  const r = await db.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'sabado', 'semanal', '09:00', $3, now()) RETURNING id`,
    [`Grupo Dois ${sequencia}`, `grupo-dois-${sequencia}`, cenario.contaA],
  );
  const grupo = r.rows[0]!.id;
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $3, $1, now()), ($2, $3, $1, now())`,
    [cenario.contaA, cenario.contaB, grupo],
  );
  return grupo;
}

async function vinculos(grupo: string): Promise<string[]> {
  const r = await aberto.db.query<{ conta_id: string }>('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1', [grupo]);
  return r.rows.map((l) => l.conta_id);
}

async function auditoriaDo(grupo: string): Promise<Array<{ acao: string; autor_conta_id: string; entidade_id: string }>> {
  const r = await aberto.db.query<{ acao: string; autor_conta_id: string; entidade_id: string }>(
    'SELECT acao, autor_conta_id, entidade_id FROM auditoria WHERE grupo_id = $1 ORDER BY id',
    [grupo],
  );
  return r.rows;
}

describe('admins.remover', () => {
  it('ACE-40: com dois admins, duas remoções simultâneas deixam um admin e a segunda dá ultimo_admin', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    // As duas pela conta A: uma remove B, a outra remove A. A espera depois da remoção mantém a
    // trava aberta, e a outra transação fica na fila do FOR UPDATE.
    const remover = (alvo: string) =>
      comDb(
        url,
        cenario.contaA,
        async (db) => {
          const r = await admins.remover(db, grupo, alvo);
          await sql`SELECT pg_sleep(0.2)`.execute(db);
          return r;
        },
        { confirmar: true },
      );
    const resultados = await Promise.all([remover(cenario.contaB), remover(cenario.contaA)]);
    expect([...resultados].sort()).toEqual(['ok', 'ultimo_admin']);
    expect(await vinculos(grupo)).toHaveLength(1);
  });

  it('ACE-40: o único admin não é removido', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaA, (db) => admins.remover(db, cenario.grupoA, cenario.contaA));
    expect(r).toBe('ultimo_admin');
  });

  it('ACE-39: remover apaga o vínculo e grava a auditoria na mesma transação', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    const r = await comDb(url, cenario.contaA, (db) => admins.remover(db, grupo, cenario.contaB), { confirmar: true });
    expect(r).toBe('ok');
    expect(await vinculos(grupo)).toEqual([cenario.contaA]);
    expect(await auditoriaDo(grupo)).toEqual([
      { acao: 'remover_admin', autor_conta_id: cenario.contaA, entidade_id: cenario.contaB },
    ]);
  });

  it('ACE-39: com erro depois da remoção, nada fica (nem o vínculo apagado nem a auditoria)', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    await expect(
      comDb(
        url,
        cenario.contaA,
        async (db) => {
          await admins.remover(db, grupo, cenario.contaB);
          throw new Error('falha depois de remover');
        },
        { confirmar: true },
      ),
    ).rejects.toThrow('falha depois de remover');
    expect((await vinculos(grupo)).sort()).toEqual([cenario.contaA, cenario.contaB].sort());
    expect(await auditoriaDo(grupo)).toEqual([]);
  });

  it('ACE-39: conta sem vínculo no grupo dá nao_encontrado; grupo de outra conta também', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    expect(await comDb(url, cenario.contaA, (db) => admins.remover(db, grupo, cenario.contaSemVinculo))).toBe('nao_encontrado');
    // B sobre o grupo de A: a RLS esconde os vínculos, nada é removido.
    expect(await comDb(url, cenario.contaB, (db) => admins.remover(db, cenario.grupoA, cenario.contaA))).toBe('nao_encontrado');
  });
});

describe('convites', () => {
  it('ACE-42: criar e cancelar convite gravam linha em auditoria com autor, ação e grupo', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    const criado = await comDb(url, cenario.contaA, (db) => convites.criar(db, grupo, 'convidada@exemplo.test', hashAleatorio()), {
      confirmar: true,
    });
    expect(criado.resultado).toBe('ok');
    if (criado.resultado !== 'ok') return;
    const cancelado = await comDb(url, cenario.contaB, (db) => convites.cancelar(db, grupo, criado.conviteId), { confirmar: true });
    expect(cancelado).toBe(true);
    const linhas = await auditoriaDo(grupo);
    expect(linhas.map((l) => [l.acao, l.autor_conta_id])).toEqual([
      ['convidar_admin', cenario.contaA],
      ['cancelar_convite', cenario.contaB],
    ]);
    expect(linhas.every((l) => l.entidade_id === criado.conviteId)).toBe(true);
  });

  it('ACE-38: cancelar de novo, ou convite de outro grupo, dá falso', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    const criado = await comDb(url, cenario.contaA, (db) => convites.criar(db, grupo, 'outra@exemplo.test', hashAleatorio()), {
      confirmar: true,
    });
    if (criado.resultado !== 'ok') throw new Error('convite não criado');
    expect(await comDb(url, cenario.contaA, (db) => convites.cancelar(db, cenario.grupoA, criado.conviteId))).toBe(false);
    await comDb(url, cenario.contaA, (db) => convites.cancelar(db, grupo, criado.conviteId), { confirmar: true });
    expect(await comDb(url, cenario.contaA, (db) => convites.cancelar(db, grupo, criado.conviteId))).toBe(false);
  });

  it('ACE-32: convidar quem já é admin dá ja_e_admin; sem vínculo, sem_vinculo', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, cenario.contaA, (db) => convites.criar(db, cenario.grupoA, cenario.emailA, hashAleatorio()))).toEqual({
      resultado: 'ja_e_admin',
    });
    expect(await comDb(url, cenario.contaB, (db) => convites.criar(db, cenario.grupoA, 'x@exemplo.test', hashAleatorio()))).toEqual({
      resultado: 'sem_vinculo',
    });
  });

  it('ACE-36: ler, aceitar e cadastrar com token inexistente dão nulo e link_invalido', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, null, (db) => convites.ler(db, hashAleatorio()))).toBeNull();
    expect(await comDb(url, cenario.contaB, (db) => convites.aceitar(db, hashAleatorio()))).toEqual({ resultado: 'link_invalido' });
    expect(
      await comDb(url, null, (db) =>
        convites.cadastrar(db, {
          tokenHash: hashAleatorio(),
          nome: 'Nova',
          senha: 'senha nova 123',
          termosVersao: '2026-11-05',
          tokenSessaoHash: hashAleatorio(),
        }),
      ),
    ).toEqual({ resultado: 'link_invalido' });
  });

  it('ACE-37: listar traz os admins e os convites pendentes, sem os cancelados', async () => {
    const { url, cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    const criado = await comDb(url, cenario.contaA, (db) => convites.criar(db, grupo, 'pendente@exemplo.test', hashAleatorio()), {
      confirmar: true,
    });
    const outro = await comDb(url, cenario.contaA, (db) => convites.criar(db, grupo, 'cancelado@exemplo.test', hashAleatorio()), {
      confirmar: true,
    });
    if (criado.resultado !== 'ok' || outro.resultado !== 'ok') throw new Error('convites não criados');
    await comDb(url, cenario.contaA, (db) => convites.cancelar(db, grupo, outro.conviteId), { confirmar: true });
    const lista = await comDb(url, cenario.contaA, (db) => admins.listar(db, grupo));
    expect(lista.admins.map((a) => a.id).sort()).toEqual([cenario.contaA, cenario.contaB].sort());
    expect(lista.convites.map((c) => c.email)).toEqual(['pendente@exemplo.test']);
  });
});
