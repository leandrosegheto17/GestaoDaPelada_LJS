import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as admins from '../../src/infraestrutura/db/repositorios/admins.ts';
import * as auditoria from '../../src/infraestrutura/db/repositorios/auditoria.ts';
import * as convites from '../../src/infraestrutura/db/repositorios/convites.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Admins do grupo e auditoria (design C2; ACE-37, ACE-39, ACE-40, ACE-41, ACE-42), como pelada_app.
let b: BancoDeRepositorio;
let sequencia = 0;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(conta: string, acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, { conta }, acao);

/** Conta gravada pelo owner (a senha não importa aqui). */
async function conta(nome: string): Promise<{ id: string; email: string; nome: string }> {
  const email = `admin${++sequencia}@exemplo.com`;
  const { rows } = await b.owner.query<{ id: string }>(
    "INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em) VALUES ($1, $2, '!', now(), now()) RETURNING id",
    [email, nome],
  );
  return { id: rows[0]?.id as string, email, nome };
}

/** Grupo com os admins dados (o primeiro com acesso ao financeiro). */
async function grupo(contaIds: string[]): Promise<string> {
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ('Grupo Admins', $1, 'quarta', 'semanal', '20:00', $2, now()) RETURNING id`,
    [`g-${randomBytes(4).toString('hex')}`, contaIds[0]],
  );
  const id = rows[0]?.id as string;
  for (const [i, c] of contaIds.entries()) {
    await b.owner.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, $3, $1, now())',
      [c, id, i === 0],
    );
  }
  return id;
}

const vinculosDe = async (grupoId: string) =>
  (
    await b.owner.query<{ conta_id: string }>('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1 ORDER BY 1', [
      grupoId,
    ])
  ).rows.map((r) => r.conta_id);

const auditoriaDe = async (grupoId: string) =>
  (
    await b.owner.query(
      'SELECT autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id FROM auditoria WHERE grupo_id = $1 ORDER BY id',
      [grupoId],
    )
  ).rows;

describe('admins.listar', () => {
  it('admin do grupo: os admins com id, nome, e-mail e acessaFinanceiro, e os convites pendentes (ACE-37)', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const g = await grupo([ana.id, bia.id]);
    const pendente = await como(ana.id, (db) => convites.criar(db, g, 'convidada@exemplo.com', randomBytes(32)));
    const cancelado = await como(ana.id, (db) => convites.criar(db, g, 'cancelada@exemplo.com', randomBytes(32)));
    await como(ana.id, (db) => convites.cancelar(db, g, cancelado.conviteId as string));
    const vencido = await como(ana.id, (db) => convites.criar(db, g, 'vencida@exemplo.com', randomBytes(32)));
    await b.owner.query('UPDATE convites_admin SET expira_em = now() WHERE id = $1', [vencido.conviteId]);

    const r = await como(bia.id, (db) => admins.listar(db, g));
    expect(r).toEqual({
      admins: [
        { id: ana.id, nome: 'Ana Admin', email: ana.email, acessaFinanceiro: true },
        { id: bia.id, nome: 'Bia Admin', email: bia.email, acessaFinanceiro: false },
      ],
      convites: [{ id: pendente.conviteId, email: 'convidada@exemplo.com', expiraEm: pendente.expiraEm }],
    });
  });

  it('conta sem vínculo com o grupo: nada, nem admins nem convites (ACE-41)', async () => {
    const ana = await conta('Ana Admin');
    const intrusa = await conta('Intrusa');
    await grupo([intrusa.id]);
    const g = await grupo([ana.id]);
    await como(ana.id, (db) => convites.criar(db, g, 'convidada@exemplo.com', randomBytes(32)));
    expect(await como(intrusa.id, (db) => admins.listar(db, g))).toEqual({ admins: [], convites: [] });
  });
});

describe('admins.remover', () => {
  it('remove o vínculo e grava a auditoria na mesma transação (ACE-39, ACE-42)', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const g = await grupo([ana.id, bia.id]);
    expect(await como(ana.id, (db) => admins.remover(db, g, bia.id))).toBe('ok');
    expect(await vinculosDe(g)).toEqual([ana.id]);
    expect(await auditoriaDe(g)).toEqual([
      {
        autor_tipo: 'conta',
        autor_conta_id: ana.id,
        acao: 'remover_admin',
        entidade: 'vinculo_admin',
        entidade_id: bia.id,
        grupo_id: g,
      },
    ]);
  });

  it('se a transação é desfeita, nem o vínculo some nem a auditoria fica (mesma transação, ACE-42)', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const g = await grupo([ana.id, bia.id]);
    await expect(
      como(ana.id, async (db) => {
        await admins.remover(db, g, bia.id);
        throw new Error('falha depois de remover');
      }),
    ).rejects.toThrow('falha depois de remover');
    expect(await vinculosDe(g)).toEqual([ana.id, bia.id].sort());
    expect(await auditoriaDe(g)).toEqual([]);
  });

  it('a conta pode remover a si mesma quando há outro admin, com a auditoria gravada', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const g = await grupo([ana.id, bia.id]);
    expect(await como(ana.id, (db) => admins.remover(db, g, ana.id))).toBe('ok');
    expect(await vinculosDe(g)).toEqual([bia.id]);
    expect(await auditoriaDe(g)).toHaveLength(1);
  });

  it('último admin: "ultimo_admin", o vínculo fica e nada vai para a auditoria (ACE-40)', async () => {
    const ana = await conta('Ana Admin');
    const g = await grupo([ana.id]);
    expect(await como(ana.id, (db) => admins.remover(db, g, ana.id))).toBe('ultimo_admin');
    expect(await vinculosDe(g)).toEqual([ana.id]);
    expect(await auditoriaDe(g)).toEqual([]);
  });

  it('conta que não é admin do grupo: "nao_encontrado"', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const outra = await conta('Outra');
    const g = await grupo([ana.id, bia.id]);
    expect(await como(ana.id, (db) => admins.remover(db, g, outra.id))).toBe('nao_encontrado');
    expect(await vinculosDe(g)).toEqual([ana.id, bia.id].sort());
  });

  it('quem não tem vínculo com o grupo não remove ninguém (ACE-41)', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const intrusa = await conta('Intrusa');
    const g = await grupo([ana.id, bia.id]);
    expect(await como(intrusa.id, (db) => admins.remover(db, g, bia.id))).toBe('nao_encontrado');
    expect(await vinculosDe(g)).toEqual([ana.id, bia.id].sort());
  });

  it('duas remoções simultâneas dos dois últimos admins deixam um admin (ACE-40)', async () => {
    const ana = await conta('Ana Admin');
    const bia = await conta('Bia Admin');
    const g = await grupo([ana.id, bia.id]);

    // Outra conexão do owner trava os vínculos do grupo: as duas remoções começam e esperam juntas; ao soltar,
    // disputam. (O owner de `b` fica fora da transação: dentro dela, o pg_stat_activity não se atualiza.)
    const trava = new pg.Client({ connectionString: b.banco.url });
    await trava.connect();
    let esperando = 0;
    let resultados: admins.ResultadoRemover[];
    try {
      await trava.query('BEGIN');
      await trava.query('SELECT 1 FROM vinculos_admin WHERE grupo_id = $1 FOR UPDATE', [g]);
      const anaRemoveBia = como(ana.id, (db) => admins.remover(db, g, bia.id));
      const biaRemoveAna = como(bia.id, (db) => admins.remover(db, g, ana.id));
      for (let i = 0; i < 100 && esperando < 2; i++) {
        const { rows } = await b.owner.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND usename = 'pelada_app' AND wait_event_type = 'Lock'",
          [b.banco.nome],
        );
        esperando = rows[0]?.n ?? 0;
        if (esperando < 2) await new Promise((ok) => setTimeout(ok, 50));
      }
      await trava.query('COMMIT');
      resultados = await Promise.all([anaRemoveBia, biaRemoveAna]);
    } finally {
      await trava.end();
    }
    expect(esperando).toBe(2);

    expect(resultados.filter((r) => r === 'ok')).toHaveLength(1);
    expect(await vinculosDe(g)).toHaveLength(1);
    expect(await auditoriaDe(g)).toHaveLength(1);
  });
});

describe('auditoria.registrar', () => {
  it('grava a linha com a conta da requisição como autora, a ação, a entidade e o grupo (ACE-42)', async () => {
    const ana = await conta('Ana Admin');
    const g = await grupo([ana.id]);
    await como(ana.id, (db) => auditoria.registrar(db, g, 'acao_teste', 'entidade_teste', 'x1', { campo: 1 }));
    const { rows } = await b.owner.query(
      'SELECT autor_tipo, autor_conta_id, acao, entidade, entidade_id, resumo, momento IS NOT NULL AS com_momento FROM auditoria WHERE grupo_id = $1',
      [g],
    );
    expect(rows).toEqual([
      {
        autor_tipo: 'conta',
        autor_conta_id: ana.id,
        acao: 'acao_teste',
        entidade: 'entidade_teste',
        entidade_id: 'x1',
        resumo: { campo: 1 },
        com_momento: true,
      },
    ]);
  });

  it('em grupo sem vínculo da conta, a RLS recusa a linha', async () => {
    const ana = await conta('Ana Admin');
    const intrusa = await conta('Intrusa');
    const g = await grupo([ana.id]);
    await expect(
      como(intrusa.id, (db) => auditoria.registrar(db, g, 'acao_teste', 'entidade_teste', 'x1')),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await auditoriaDe(g)).toEqual([]);
  });
});
