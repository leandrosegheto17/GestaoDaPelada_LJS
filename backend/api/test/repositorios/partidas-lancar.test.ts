import type { PartidaCorpo } from '@pelada/contrato';
import { MENSAGEM_JOGADOR_INATIVO } from '@pelada/dominio';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { partidas } from '../../src/infraestrutura/db/repositorios/partidas.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `partidas.lancar` (T30; PAR-22 a PAR-30, PAR-142), contra o cenário de grupos. Em G: Toninho e Bira ativos desde
 * 2026-01-01, Zé Inativo de 2025-03-01 a 2025-12-31, e a partida de 2026-01-08 do cenário. Os casos confirmam a
 * transação e o `afterEach` apaga o que lançaram (partidas, eventos e auditorias além das do cenário).
 *
 * Casos limite: ausente e ativo sem marcação; inativo, de outro grupo e repetido; partida sem presença; data que já
 * existe; corrida de duas conexões; falha depois das presenças.
 */

let aberto: CenarioGruposAberto;
let jogadorDeH: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ id: string }>(
    'SELECT id FROM jogadores WHERE grupo_id = $1 LIMIT 1',
    [aberto.cenario.grupoH],
  );
  jogadorDeH = r.rows[0]?.id ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM partidas WHERE grupo_id = $1 AND data <> '2026-01-08'`, [
    cenario.grupoG,
  ]);
  await db.query(
    `DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'partida_lancada' AND data_partida <> '2026-01-08'`,
    [cenario.grupoG],
  );
  await db.query(`DELETE FROM auditoria WHERE acao = 'partida_lancada'`);
  await db.query('DROP TRIGGER IF EXISTS falha_teste_par28 ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_par28()');
});

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function lancarComo(conta: string, dados: PartidaCorpo) {
  return comDb(aberto.url, conta, (db) => partidas.lancar(db, aberto.cenario.grupoG, dados), {
    confirmar: true,
  });
}

async function partidaDe(data: string) {
  const r = await aberto.db.query<{ id: string; choveu: boolean; criada_por: string }>(
    'SELECT id, choveu, criada_por FROM partidas WHERE grupo_id = $1 AND data = $2',
    [aberto.cenario.grupoG, data],
  );
  return r.rows;
}

async function presencasDe(data: string) {
  const r = await aberto.db.query<{ jogador_id: string; situacao: string }>(
    `SELECT p.jogador_id, p.situacao FROM presencas p JOIN partidas pt ON pt.id = p.partida_id
      WHERE pt.grupo_id = $1 AND pt.data = $2 ORDER BY p.jogador_id`,
    [aberto.cenario.grupoG, data],
  );
  return r.rows;
}

async function eventosDe(data: string) {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'partida_lancada' AND data_partida = $2`,
    [aberto.cenario.grupoG, data],
  );
  return r.rows[0]?.n ?? -1;
}

async function auditoriasLancada() {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = 'partida_lancada' ORDER BY id`,
  );
  return r.rows;
}

describe('partidas.lancar', () => {
  it('PAR-22: grava a partida, a presença marcada, o evento e a auditoria, com a conta como autora', async () => {
    const { cenario } = aberto;
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-05',
      choveu: true,
      marcacoes: [{ jogadorId: cenario.idsG.jogadorAtivo, situacao: 'presente' }],
    });
    expect(r).toMatchObject({
      resultado: 'ok',
      contagem: { presentes: 1, lesionados: 0, expulsos: 0 },
    });
    expect(await partidaDe('2026-02-05')).toEqual([
      { id: expect.any(String), choveu: true, criada_por: cenario.contaC },
    ]);
    expect(await presencasDe('2026-02-05')).toEqual([
      { jogador_id: cenario.idsG.jogadorAtivo, situacao: 'presente' },
    ]);
    expect(await eventosDe('2026-02-05')).toBe(1);
    expect((await auditoriasLancada()).map((a) => a.autor)).toEqual([cenario.contaC]);
  });

  it('PAR-23: ausente e ativo sem marcação não gravam linha', async () => {
    const { cenario } = aberto;
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-12',
      choveu: false,
      marcacoes: [
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'lesionado' },
        { jogadorId: cenario.idsG.jogadorHistorico, situacao: 'ausente' },
      ],
    });
    expect(r).toMatchObject({
      resultado: 'ok',
      contagem: { presentes: 0, lesionados: 1, expulsos: 0 },
    });
    expect(await presencasDe('2026-02-12')).toEqual([
      { jogador_id: cenario.idsG.jogadorAtivo, situacao: 'lesionado' },
    ]);
  });

  it('PAR-23: partida sem nenhuma marcação grava a partida com as contagens zeradas', async () => {
    const { cenario } = aberto;
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-19',
      choveu: false,
      marcacoes: [],
    });
    expect(r).toMatchObject({
      resultado: 'ok',
      contagem: { presentes: 0, lesionados: 0, expulsos: 0 },
    });
    expect(await partidaDe('2026-02-19')).toHaveLength(1);
    expect(await presencasDe('2026-02-19')).toEqual([]);
  });

  it('PAR-24: jogador inativo na data é recusado com a mensagem no campo, sem gravar nada', async () => {
    const { cenario } = aberto;
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-26',
      choveu: false,
      marcacoes: [
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'presente' },
        { jogadorId: cenario.idsG.jogadorInativo, situacao: 'presente' },
      ],
    });
    expect(r).toEqual({
      resultado: 'invalido',
      campos: { 'marcacoes.1.jogadorId': MENSAGEM_JOGADOR_INATIVO },
    });
    expect(await partidaDe('2026-02-26')).toEqual([]);
    expect(await eventosDe('2026-02-26')).toBe(0);
    expect(await auditoriasLancada()).toEqual([]);
  });

  it('PAR-24: jogador de outro grupo recebe a mesma mensagem do inativo', async () => {
    const { cenario } = aberto;
    expect(jogadorDeH, 'o cenário precisa de jogador em H').toBeTruthy();
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-26',
      choveu: false,
      marcacoes: [{ jogadorId: jogadorDeH, situacao: 'presente' }],
    });
    expect(r).toEqual({
      resultado: 'invalido',
      campos: { 'marcacoes.0.jogadorId': MENSAGEM_JOGADOR_INATIVO },
    });
    expect(await partidaDe('2026-02-26')).toEqual([]);
  });

  it('PAR-25: jogador repetido é recusado no campo marcacoes, sem gravar', async () => {
    const { cenario } = aberto;
    const r = await lancarComo(cenario.contaC, {
      data: '2026-02-26',
      choveu: false,
      marcacoes: [
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'presente' },
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'expulso' },
      ],
    });
    expect(r).toMatchObject({ resultado: 'invalido', campos: { marcacoes: expect.any(String) } });
    expect(await partidaDe('2026-02-26')).toEqual([]);
  });

  it('PAR-30: data que já tem partida devolve partida_ja_existe e a transação continua utilizável', async () => {
    const { cenario } = aberto;
    const depois = await comDb(aberto.url, cenario.contaC, async (db) => {
      const r = await partidas.lancar(db, cenario.grupoG, {
        data: '2026-01-08',
        choveu: false,
        marcacoes: [],
      });
      const ainda = await sql<{ ok: number }>`SELECT 1 AS ok`.execute(db);
      return { r, ainda: ainda.rows[0]?.ok };
    });
    expect(depois).toEqual({ r: { resultado: 'partida_ja_existe' }, ainda: 1 });
    expect(await partidaDe('2026-01-08')).toHaveLength(1);
  });

  it('PAR-30: dois lançamentos simultâneos da mesma data: um grava e o outro recebe partida_ja_existe', async () => {
    const { cenario } = aberto;
    const dados: PartidaCorpo = {
      data: '2026-03-05',
      choveu: false,
      marcacoes: [{ jogadorId: cenario.idsG.jogadorAtivo, situacao: 'presente' }],
    };
    let liberar!: () => void;
    const segurando = new Promise<void>((r) => (liberar = r));
    let avisarGravou!: () => void;
    const gravou = new Promise<void>((r) => (avisarGravou = r));

    const primeiro = comDb(
      aberto.url,
      cenario.contaC,
      async (db) => {
        const r = await partidas.lancar(db, cenario.grupoG, dados);
        avisarGravou();
        await segurando;
        return r;
      },
      { confirmar: true },
    );
    await gravou;
    const segundo = comDb(
      aberto.url,
      cenario.contaO,
      (db) => partidas.lancar(db, cenario.grupoG, dados),
      {
        confirmar: true,
      },
    );
    await espera(300);
    liberar();
    const [r1, r2] = await Promise.all([primeiro, segundo]);
    expect(r1.resultado).toBe('ok');
    expect(r2).toEqual({ resultado: 'partida_ja_existe' });
    expect(await partidaDe('2026-03-05')).toHaveLength(1);
    expect(await eventosDe('2026-03-05')).toBe(1);
  });

  it('PAR-28: falha forçada depois das presenças desfaz partida, presenças, evento e auditoria', async () => {
    const { cenario } = aberto;
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_par28() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'partida_lancada' THEN RAISE EXCEPTION 'falha forçada (PAR-28)'; END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_par28 BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_par28()',
    );
    await expect(
      lancarComo(cenario.contaC, {
        data: '2026-03-12',
        choveu: false,
        marcacoes: [{ jogadorId: cenario.idsG.jogadorAtivo, situacao: 'presente' }],
      }),
    ).rejects.toThrow('falha forçada');
    expect(await partidaDe('2026-03-12')).toEqual([]);
    expect(await presencasDe('2026-03-12')).toEqual([]);
    expect(await eventosDe('2026-03-12')).toBe(0);
    expect(await auditoriasLancada()).toEqual([]);
  });

  it('PAR-142: a auditoria partida_lancada só tem data, chuva e contagens', async () => {
    const { cenario } = aberto;
    await lancarComo(cenario.contaC, {
      data: '2026-03-19',
      choveu: true,
      marcacoes: [
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'expulso' },
        { jogadorId: cenario.idsG.jogadorHistorico, situacao: 'presente' },
      ],
    });
    const [a] = await auditoriasLancada();
    expect(a?.resumo).toEqual({
      data: '2026-03-19',
      choveu: true,
      presentes: 1,
      lesionados: 0,
      expulsos: 1,
    });
  });
});
