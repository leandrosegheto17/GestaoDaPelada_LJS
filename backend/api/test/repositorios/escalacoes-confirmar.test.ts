import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Escalada } from '@pelada/contrato';
import { escalacoes, type EscalacaoParaGravar } from '../../src/infraestrutura/db/repositorios/escalacoes.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `escalacoes.confirmar` (T28 da simulador; SIM-67, SIM-69, SIM-70, SIM-72, SIM-87), contra o cenário de grupos, como
 * `pelada_app` com a conta C (criadora de G). As datas de teste (fevereiro de 2026) não colidem com a escalação do
 * cenário (2026-01-08); o `afterEach` apaga as escalações e os eventos dessas datas e o gatilho de falha.
 *
 * Os jogadores da composição são ids quaisquer: o `jsonb` não tem chave estrangeira, e quem confere que estão ativos é
 * a rota (SIM-71).
 */

let aberto: CenarioGruposAberto;

const DATA = '2026-02-05';
const DATAS = ['2026-02-05', '2026-02-12', '2026-02-19'];
const MOMENTO_1 = '2026-02-04T22:00:00.000Z';
const MOMENTO_2 = '2026-02-04T23:30:00.000Z';

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DROP TRIGGER IF EXISTS falha_teste_sim70 ON eventos_uso');
  await db.query('DROP TRIGGER IF EXISTS falha_teste_sim70_escalacao ON escalacoes');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_sim70()');
  await db.query('DELETE FROM escalacoes WHERE grupo_id = $1 AND data = ANY($2::date[])', [cenario.grupoG, DATAS]);
  await db.query(
    `DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'escalacao_confirmada' AND data_partida = ANY($2::date[])`,
    [cenario.grupoG, DATAS],
  );
});

function ids(n: number): string[] {
  return Array.from({ length: n }, () => crypto.randomUUID());
}

function doisTimes(): Escalada {
  const [a1, a2, b1, b2, r1, r2, fora] = ids(7);
  return {
    formato: 'dois_times',
    composicao: {
      times: [
        { titulares: [{ id: a1!, so1oTempo: false }, { id: a2!, so1oTempo: true }], entramNo2oTempo: [{ id: r1!, so1oTempo: false }] },
        { titulares: [{ id: b1!, so1oTempo: false }, { id: b2!, so1oTempo: false }], entramNo2oTempo: [{ id: r2!, so1oTempo: false }] },
      ],
      naoEntra: [fora!],
    },
  };
}

function variosTimes(): Escalada {
  const todos = ids(10);
  return {
    formato: 'varios_times',
    composicao: { times: [{ jogadores: todos.slice(0, 4) }, { jogadores: todos.slice(4, 8) }, { jogadores: todos.slice(8) }] },
  };
}

function confirmarComo(e: EscalacaoParaGravar, momento = MOMENTO_1, confirmar = true) {
  const { cenario } = aberto;
  return comDb(aberto.url, cenario.contaC, (db) => escalacoes.confirmar(db, cenario.grupoG, e, cenario.contaC, momento), {
    confirmar,
  });
}

interface LinhaGravada {
  formato: string;
  n: number;
  k: number | null;
  composicao: unknown;
  confirmada_por: string;
  confirmada_em: Date;
}

async function linhas(data = DATA): Promise<LinhaGravada[]> {
  const r = await aberto.db.query<LinhaGravada>(
    'SELECT formato, n, k, composicao, confirmada_por, confirmada_em FROM escalacoes WHERE grupo_id = $1 AND data = $2',
    [aberto.cenario.grupoG, data],
  );
  return r.rows;
}

async function eventos(data = DATA): Promise<Record<string, unknown>[]> {
  const r = await aberto.db.query<Record<string, unknown>>(
    `SELECT * FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'escalacao_confirmada' AND data_partida = $2 ORDER BY id`,
    [aberto.cenario.grupoG, data],
  );
  return r.rows;
}

/** Espera até haver uma conexão do banco de teste parada num lock (a segunda confirmação). */
async function esperarAlguemNoLock(): Promise<void> {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    const r = await aberto.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (Number(r.rows[0]?.n) > 0) return;
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  throw new Error('a segunda confirmação não chegou a esperar o lock');
}

describe('escalacoes.confirmar', () => {
  it('SIM-67: grava formato, N, K, composição, autora e momento, e devolve data e confirmadaEm', async () => {
    const escalada = doisTimes();
    const r = await confirmarComo({ data: DATA, n: 2, k: 1, escalada });
    expect(r).toEqual({ data: DATA, confirmadaEm: MOMENTO_1 });
    const [linha, ...resto] = await linhas();
    expect(resto).toEqual([]);
    expect(linha).toMatchObject({ formato: 'dois_times', n: 2, k: 1, confirmada_por: aberto.cenario.contaC });
    expect(linha?.composicao).toEqual(escalada.composicao);
    expect(linha?.confirmada_em.toISOString()).toBe(MOMENTO_1);
  });

  it('SIM-69: confirmar duas vezes a mesma data deixa uma linha com a segunda composição e dois eventos', async () => {
    const primeira = doisTimes();
    const segunda = doisTimes();
    await confirmarComo({ data: DATA, n: 2, k: 1, escalada: primeira }, MOMENTO_1);
    await confirmarComo({ data: DATA, n: 2, k: 0, escalada: segunda }, MOMENTO_2);
    const gravadas = await linhas();
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.composicao).toEqual(segunda.composicao);
    expect(gravadas[0]?.k).toBe(0);
    expect(gravadas[0]?.confirmada_em.toISOString()).toBe(MOMENTO_2);
    expect(await eventos()).toHaveLength(2);
  });

  it('SIM-69: a nova confirmação pode trocar o formato da data', async () => {
    await confirmarComo({ data: DATA, n: 2, k: 1, escalada: doisTimes() });
    await confirmarComo({ data: DATA, n: 4, escalada: variosTimes() }, MOMENTO_2);
    const gravadas = await linhas();
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({ formato: 'varios_times', n: 4, k: null });
  });

  it('SIM-72: 3 ou mais times grava k nulo, mesmo se vier K', async () => {
    await confirmarComo({ data: DATA, n: 4, k: 3, escalada: variosTimes() });
    expect((await linhas())[0]?.k).toBeNull();
  });

  it('SIM-72: 2 times com K ilimitado grava k nulo', async () => {
    await confirmarComo({ data: DATA, n: 2, k: 'ilimitado', escalada: doisTimes() });
    expect((await linhas())[0]).toMatchObject({ formato: 'dois_times', k: null });
  });

  it('SIM-72: 2 times com K 0 grava 0, não nulo', async () => {
    await confirmarComo({ data: DATA, n: 2, k: 0, escalada: doisTimes() });
    expect((await linhas())[0]?.k).toBe(0);
  });

  it('SIM-70: o evento escalacao_confirmada tem a data da partida e o momento, sem dado de jogador', async () => {
    const escalada = doisTimes();
    await confirmarComo({ data: DATA, n: 2, k: 1, escalada });
    const [evento, ...resto] = await eventos();
    expect(resto).toEqual([]);
    expect(evento).toMatchObject({ grupo_id: aberto.cenario.grupoG, dispositivo_id: null, mes_exportado: null });
    expect((evento?.['momento'] as Date).toISOString()).toBe(MOMENTO_1);
    // Nenhum id de jogador da composição aparece no evento.
    const texto = JSON.stringify(evento);
    const jogadoresDaComposicao =
      escalada.formato === 'dois_times'
        ? [
            ...escalada.composicao.times.flatMap((t) => [...t.titulares, ...t.entramNo2oTempo].map((j) => j.id)),
            ...escalada.composicao.naoEntra,
          ]
        : [];
    for (const id of jogadoresDaComposicao) expect(texto).not.toContain(id);
  });

  it('SIM-70: falha forçada no INSERT do evento desfaz a escalação', async () => {
    const { db } = aberto;
    await db.query(`CREATE FUNCTION falha_teste_sim70() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada (SIM-70)'; END $$`);
    await db.query(`CREATE TRIGGER falha_teste_sim70 BEFORE INSERT ON eventos_uso FOR EACH ROW
      WHEN (NEW.tipo = 'escalacao_confirmada') EXECUTE FUNCTION falha_teste_sim70()`);
    await expect(confirmarComo({ data: DATA, n: 2, k: 1, escalada: doisTimes() })).rejects.toThrow(/falha forçada/);
    expect(await linhas()).toEqual([]);
    expect(await eventos()).toEqual([]);
  });

  it('SIM-70: falha forçada na escalação não grava evento', async () => {
    const { db } = aberto;
    await db.query(`CREATE FUNCTION falha_teste_sim70() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada (SIM-70)'; END $$`);
    await db.query(`CREATE TRIGGER falha_teste_sim70_escalacao BEFORE INSERT ON escalacoes FOR EACH ROW
      EXECUTE FUNCTION falha_teste_sim70()`);
    await expect(confirmarComo({ data: DATA, n: 2, k: 1, escalada: doisTimes() })).rejects.toThrow(/falha forçada/);
    expect(await linhas()).toEqual([]);
    expect(await eventos()).toEqual([]);
  });

  it('SIM-70: substituir com falha no evento mantém a escalação anterior', async () => {
    const { db } = aberto;
    const primeira = doisTimes();
    await confirmarComo({ data: DATA, n: 2, k: 1, escalada: primeira });
    await db.query(`CREATE FUNCTION falha_teste_sim70() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada (SIM-70)'; END $$`);
    await db.query(`CREATE TRIGGER falha_teste_sim70 BEFORE INSERT ON eventos_uso FOR EACH ROW
      WHEN (NEW.tipo = 'escalacao_confirmada') EXECUTE FUNCTION falha_teste_sim70()`);
    await expect(confirmarComo({ data: DATA, n: 2, k: 0, escalada: doisTimes() }, MOMENTO_2)).rejects.toThrow(
      /falha forçada/,
    );
    const gravadas = await linhas();
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.composicao).toEqual(primeira.composicao);
    expect(await eventos()).toHaveLength(1);
  });

  it('SIM-87: duas conexões confirmando a mesma data terminam com uma linha (a última) e nenhum 23505', async () => {
    const { cenario } = aberto;
    const primeira = doisTimes();
    const segunda = doisTimes();
    let liberarA!: () => void;
    const travaA = new Promise<void>((resolver) => {
      liberarA = resolver;
    });
    let gravouA!: () => void;
    const aGravou = new Promise<void>((resolver) => {
      gravouA = resolver;
    });

    // A grava e segura a transação aberta; B tenta a mesma data e espera o lock da linha.
    const a = comDb(
      aberto.url,
      cenario.contaC,
      async (db) => {
        const r = await escalacoes.confirmar(db, cenario.grupoG, { data: DATA, n: 2, k: 1, escalada: primeira }, cenario.contaC, MOMENTO_1);
        gravouA();
        await travaA;
        return r;
      },
      { confirmar: true },
    );
    await aGravou;
    const b = confirmarComo({ data: DATA, n: 2, k: 0, escalada: segunda }, MOMENTO_2);
    try {
      await esperarAlguemNoLock();
    } finally {
      liberarA();
    }

    const resultados = await Promise.allSettled([a, b]);
    expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const gravadas = await linhas();
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.composicao).toEqual(segunda.composicao);
    expect(await eventos()).toHaveLength(2);
  });

  it('SIM-67: datas diferentes do mesmo grupo são escalações separadas', async () => {
    await confirmarComo({ data: DATAS[0]!, n: 2, k: 1, escalada: doisTimes() });
    await confirmarComo({ data: DATAS[1]!, n: 2, k: 1, escalada: doisTimes() });
    expect(await linhas(DATAS[0])).toHaveLength(1);
    expect(await linhas(DATAS[1])).toHaveLength(1);
  });

  it('SIM-67: a conta de outro grupo não grava em G (a RLS recusa)', async () => {
    const { cenario } = aberto;
    await expect(
      comDb(
        aberto.url,
        cenario.contaB,
        (db) => escalacoes.confirmar(db, cenario.grupoG, { data: DATA, n: 2, k: 1, escalada: doisTimes() }, cenario.contaB, MOMENTO_1),
        { confirmar: true },
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await linhas()).toEqual([]);
  });
});
