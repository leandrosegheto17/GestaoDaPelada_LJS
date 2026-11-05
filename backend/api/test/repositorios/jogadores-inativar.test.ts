import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Inativar o jogador (T38; GEL-51, GEL-52, GEL-53, GEL-58, GEL-68, GEL-109), contra o cenário de grupos. Cada caso cria
 * como superusuário um jogador com período aberto desde 2026-09-01 (e, quando pede, uma partida e uma presença) e o
 * apaga no `afterEach`. "Hoje" é 2026-11-05. Os casos que conferem a auditoria confirmam a transação.
 *
 * Casos limite: sem data; saída igual ao início; saída antes de presença; já inativo; erro depois do `UPDATE`.
 */

let aberto: CenarioGruposAberto;
const jogadoresCriados: string[] = [];
const partidasCriadas: string[] = [];

const HOJE = '2026-11-05';

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query('DELETE FROM presencas WHERE jogador_id = ANY($1::uuid[])', [jogadoresCriados]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [jogadoresCriados]);
  await db.query('DELETE FROM partidas WHERE id = ANY($1::uuid[])', [partidasCriadas]);
  jogadoresCriados.length = 0;
  partidasCriadas.length = 0;
  await db.query('DROP TRIGGER IF EXISTS falha_teste_gel109 ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_gel109()');
});

async function novoJogador(
  apelido: string,
  inicio = '2026-09-01',
  fim: string | null = null,
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, $4, now(), $4, now()) RETURNING id`,
    [cenario.grupoG, apelido, inicio, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    'INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4)',
    [id, cenario.grupoG, inicio, fim],
  );
  jogadoresCriados.push(id);
  return id;
}

async function presencaEm(jogador: string, data: string, situacao = 'presente'): Promise<void> {
  const { db, cenario } = aberto;
  const p = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, data, cenario.contaC],
  );
  partidasCriadas.push(p.rows[0]!.id);
  await db.query(
    'INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, $4)',
    [p.rows[0]!.id, jogador, cenario.grupoG, situacao],
  );
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

async function inativados(id: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = 'jogador_inativado' AND entidade_id = $1`,
    [id],
  );
  return r.rows;
}

function inativarComo(conta: string, grupo: string, id: string, data?: string, confirmar = true) {
  return comDb(
    aberto.url,
    conta,
    (db) => jogadores.inativar(db, grupo, id, data === undefined ? {} : { data }, HOJE),
    {
      confirmar,
    },
  );
}

describe('jogadores.inativar', () => {
  it('GEL-51: encerra o período na data dada e audita jogador_inativado com a conta autora', async () => {
    const id = await novoJogador('Sai em Outubro');
    const r = await inativarComo(aberto.cenario.contaO, aberto.cenario.grupoG, id, '2026-10-20');
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-20' }]);
    const a = await inativados(id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(aberto.cenario.contaO);
    expect(a[0]?.resumo).toMatchObject({ saida: '2026-10-20' });
  });

  it('GEL-52: sem data, a saída é hoje', async () => {
    const id = await novoJogador('Sai Hoje');
    await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id);
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: HOJE }]);
  });

  it('GEL-61: saída igual ao início do período é aceita ([início, fim))', async () => {
    const id = await novoJogador('Mesmo Dia', '2026-10-10');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-10-10');
    expect(r.resultado).toBe('ok');
    expect(await periodos(id)).toEqual([{ inicio: '2026-10-10', fim: '2026-10-10' }]);
  });

  it('GEL-53: já inativo devolve ja_inativo sem gravar nem auditar', async () => {
    const id = await novoJogador('Já Saiu', '2026-01-01', '2026-03-01');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-10-01');
    expect(r).toEqual({ resultado: 'ja_inativo' });
    expect(await periodos(id)).toEqual([{ inicio: '2026-01-01', fim: '2026-03-01' }]);
    expect(await inativados(id)).toEqual([]);
  });

  it('GEL-68: presença em 01/10 e saída em 30/09 é recusada com a data mínima 02/10/2026', async () => {
    const id = await novoJogador('Jogou em Outubro');
    await presencaEm(id, '2026-10-01');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-09-30');
    expect(r).toMatchObject({ resultado: 'invalido', regra: 'presenca', campo: 'saida' });
    if (r.resultado === 'invalido') expect(r.mensagem).toContain('02/10/2026');
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
    expect(await inativados(id)).toEqual([]);
  });

  it('GEL-68: ausência não bloqueia a saída', async () => {
    const id = await novoJogador('Faltou em Outubro');
    await presencaEm(id, '2026-10-01', 'ausente');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-09-30');
    expect(r.resultado).toBe('ok');
  });

  it('GEL-58, GEL-64: saída no futuro é recusada pela regra de período', async () => {
    const id = await novoJogador('Futuro');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-11-06');
    expect(r).toMatchObject({ resultado: 'invalido', regra: 'futuro', campo: 'saida' });
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('GEL-58, GEL-65: saída antes do início do período é recusada', async () => {
    const id = await novoJogador('Antes do Início');
    const r = await inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-08-31');
    expect(r).toMatchObject({ resultado: 'invalido', regra: 'saida-antes-do-inicio' });
  });

  it('GEL-44: jogador de outro grupo dá nao_encontrado e nada muda', async () => {
    const id = await novoJogador('De G');
    const r = await inativarComo(aberto.cenario.contaB, aberto.cenario.grupoH, id, '2026-10-01');
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('GEL-109: erro forçado depois do UPDATE (na auditoria) deixa o período e a auditoria como antes', async () => {
    const id = await novoJogador('Falha na Auditoria');
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_gel109() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'jogador_inativado' AND NEW.entidade_id = '${id}' THEN
           RAISE EXCEPTION 'falha forçada (GEL-109)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_gel109 BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_gel109()',
    );
    await expect(
      inativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-10-01'),
    ).rejects.toThrow('falha forçada');
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
    expect(await inativados(id)).toEqual([]);
  });
});
