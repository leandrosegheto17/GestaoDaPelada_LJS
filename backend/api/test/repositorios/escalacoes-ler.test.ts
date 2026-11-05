import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { escalacoes } from '../../src/infraestrutura/db/repositorios/escalacoes.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `escalacoes.porData` e `escalacoes.idsNaData` (T29 da simulador; SIM-75, SIM-76, SIM-94), contra o cenário de grupos.
 * As escalações são gravadas como superusuário (o dono das tabelas), inclusive as de forma inválida que a API nunca
 * grava; a leitura é como `pelada_app` com a conta C (criadora de G). O `afterEach` apaga o que o caso gravou.
 */

let aberto: CenarioGruposAberto;
const DATA = '2026-03-05';

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM escalacoes WHERE grupo_id = ANY($1::uuid[]) AND data = $2', [
    [cenario.grupoG, cenario.grupoH],
    DATA,
  ]);
});

const [A1, A2, B1, B2, R1, R2, FORA, V1, V2, V3, V4, V5] = Array.from({ length: 12 }, () => crypto.randomUUID());

const COMPOSICAO_DOIS = {
  times: [
    { titulares: [{ id: A1, so1oTempo: false }, { id: A2, so1oTempo: true }], entramNo2oTempo: [{ id: R1, so1oTempo: false }] },
    { titulares: [{ id: B1, so1oTempo: false }, { id: B2, so1oTempo: false }], entramNo2oTempo: [{ id: R2, so1oTempo: false }] },
  ],
  naoEntra: [FORA],
};

const COMPOSICAO_VARIOS = { times: [{ jogadores: [V1, V2] }, { jogadores: [V3, V4] }, { jogadores: [V5] }] };

async function gravarComoDono(grupo: string, formato: string, n: number, k: number | null, composicao: string) {
  await aberto.db.query(
    `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())`,
    [grupo, DATA, formato, n, k, composicao, aberto.cenario.contaC],
  );
}

function lerComo(grupo: string, fn: typeof escalacoes.porData | typeof escalacoes.idsNaData): Promise<unknown> {
  return comDb(aberto.url, aberto.cenario.contaC, (db) => fn(db, grupo, DATA));
}

async function idsComo(grupo: string): Promise<string[]> {
  const ids = await comDb(aberto.url, aberto.cenario.contaC, (db) => escalacoes.idsNaData(db, grupo, DATA));
  expect(ids).not.toBeNull();
  return [...(ids ?? [])].sort();
}

describe('escalacoes.porData', () => {
  it('SIM-75: lê formato, N, K e a composição de 2 times', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'dois_times', 2, 1, JSON.stringify(COMPOSICAO_DOIS));
    const lida = await lerComo(aberto.cenario.grupoG, escalacoes.porData);
    expect(lida).toEqual({
      data: DATA,
      n: 2,
      k: 1,
      escalada: { formato: 'dois_times', composicao: COMPOSICAO_DOIS },
    });
  });

  it('SIM-75: 3 ou mais times com k nulo', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'varios_times', 2, null, JSON.stringify(COMPOSICAO_VARIOS));
    const lida = await lerComo(aberto.cenario.grupoG, escalacoes.porData);
    expect(lida).toEqual({ data: DATA, n: 2, k: null, escalada: { formato: 'varios_times', composicao: COMPOSICAO_VARIOS } });
  });

  it('SIM-76: sem escalação na data devolve nulo', async () => {
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.porData)).toBeNull();
  });

  it('SIM-94: composição com forma inválida ({"x":1}) volta nula, sem erro', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'dois_times', 2, 1, '{"x":1}');
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.porData)).toBeNull();
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.idsNaData)).toBeNull();
  });

  it('SIM-94: composição de 3+ gravada numa escalação de 2 times é inválida', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'dois_times', 2, 1, JSON.stringify(COMPOSICAO_VARIOS));
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.porData)).toBeNull();
  });

  it('SIM-94: composição com campo extra (apelido) é inválida', async () => {
    const comApelido = {
      ...COMPOSICAO_DOIS,
      times: [
        { titulares: [{ id: A1, so1oTempo: false, apelido: 'Japa' }], entramNo2oTempo: [] },
        { titulares: [{ id: B1, so1oTempo: false }], entramNo2oTempo: [] },
      ],
    };
    await gravarComoDono(aberto.cenario.grupoG, 'dois_times', 2, 1, JSON.stringify(comApelido));
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.porData)).toBeNull();
  });

  it('a escalação do grupo H (da conta B) não é lida pela conta C', async () => {
    await gravarComoDono(aberto.cenario.grupoH, 'dois_times', 2, 1, JSON.stringify(COMPOSICAO_DOIS));
    expect(await lerComo(aberto.cenario.grupoH, escalacoes.porData)).toBeNull();
    expect(await lerComo(aberto.cenario.grupoH, escalacoes.idsNaData)).toBeNull();
  });

  it('a escalação do grupo H na mesma data não vaza para a leitura de G', async () => {
    await gravarComoDono(aberto.cenario.grupoH, 'dois_times', 2, 1, JSON.stringify(COMPOSICAO_DOIS));
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.porData)).toBeNull();
  });
});

describe('escalacoes.idsNaData', () => {
  it('SIM-75: em 2 times, os ids incluem titulares, reservas e "não entra"', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'dois_times', 2, 1, JSON.stringify(COMPOSICAO_DOIS));
    expect(await idsComo(aberto.cenario.grupoG)).toEqual([A1, A2, B1, B2, R1, R2, FORA].sort());
  });

  it('SIM-75: em 3 ou mais, os ids de todos os times, inclusive o incompleto', async () => {
    await gravarComoDono(aberto.cenario.grupoG, 'varios_times', 2, null, JSON.stringify(COMPOSICAO_VARIOS));
    expect(await idsComo(aberto.cenario.grupoG)).toEqual([V1, V2, V3, V4, V5].sort());
  });

  it('SIM-76: sem escalação na data devolve nulo', async () => {
    expect(await lerComo(aberto.cenario.grupoG, escalacoes.idsNaData)).toBeNull();
  });
});
