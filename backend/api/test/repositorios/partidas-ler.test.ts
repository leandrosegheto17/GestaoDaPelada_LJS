import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { partidas } from '../../src/infraestrutura/db/repositorios/partidas.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `partidas.doMes`, `ler` e `mesDaPrimeira` (T32; PAR-37, PAR-41, PAR-44), contra o cenário de grupos (em G, a
 * partida de 2026-01-08 com Bira presente). Os casos gravam como superusuário e o `afterEach` apaga o que gravaram.
 */

let aberto: CenarioGruposAberto;
let nomeC: string;
const extras: string[] = [];

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [
    aberto.cenario.contaC,
  ]);
  nomeC = r.rows[0]?.nome ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM partidas WHERE grupo_id = $1 AND data <> '2026-01-08'`, [
    cenario.grupoG,
  ]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [extras]);
  extras.length = 0;
});

/** Grava uma partida de G como superusuário, com as presenças dadas, e devolve o id. */
async function partida(
  data: string,
  choveu: boolean,
  presencas: Array<[string, string]> = [],
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, $3, $4, now(), $4, '2026-10-15T22:30:00Z') RETURNING id`,
    [cenario.grupoG, data, choveu, cenario.contaC],
  );
  const id = r.rows[0]?.id ?? '';
  for (const [jogador, situacao] of presencas) {
    await db.query(
      'INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, $4)',
      [id, jogador, cenario.grupoG, situacao],
    );
  }
  return id;
}

async function jogadorAtivo(apelido: string, inicio: string): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'atacante', $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]?.id ?? '';
  await db.query(
    'INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, NULL)',
    [id, cenario.grupoG, inicio],
  );
  extras.push(id);
  return id;
}

function comoC<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, aberto.cenario.contaC, fn);
}

describe('partidas.doMes', () => {
  it('PAR-37: outubro com 01, 08 (chuva) e 15 vem de 15 para 01, com as contagens', async () => {
    const { cenario } = aberto;
    const { jogadorAtivo: toninho, jogadorHistorico: bira } = cenario.idsG;
    await partida('2026-10-01', false, [
      [toninho, 'presente'],
      [bira, 'lesionado'],
    ]);
    await partida('2026-10-08', true, [[toninho, 'expulso']]);
    await partida('2026-10-15', false);
    await partida('2026-11-05', false, [[toninho, 'presente']]);
    await partida('2026-09-30', false, [[toninho, 'presente']]);
    const r = await comoC((db) => partidas.doMes(db, cenario.grupoG, '2026-10'));
    expect(r).toEqual([
      { data: '2026-10-15', choveu: false, contagem: { presentes: 0, lesionados: 0, expulsos: 0 } },
      { data: '2026-10-08', choveu: true, contagem: { presentes: 0, lesionados: 0, expulsos: 1 } },
      { data: '2026-10-01', choveu: false, contagem: { presentes: 1, lesionados: 1, expulsos: 0 } },
    ]);
  });

  it('PAR-37: mês sem partida devolve lista vazia; a conta de outro grupo não vê as de G', async () => {
    const { cenario } = aberto;
    expect(await comoC((db) => partidas.doMes(db, cenario.grupoG, '2026-12'))).toEqual([]);
    expect(
      await comDb(aberto.url, cenario.contaB, (db) =>
        partidas.doMes(db, cenario.grupoG, '2026-01'),
      ),
    ).toEqual([]);
  });
});

describe('partidas.ler', () => {
  it('PAR-44: chuva, autora pelo nome, momento ISO e os ativos na data com a situação ou ausente', async () => {
    const { cenario } = aberto;
    const { jogadorAtivo: toninho, jogadorHistorico: bira } = cenario.idsG;
    await partida('2026-02-05', true, [[bira, 'presente']]);
    const r = await comoC((db) => partidas.ler(db, cenario.grupoG, '2026-02-05'));
    expect(r).toEqual({
      data: '2026-02-05',
      choveu: true,
      alteradaPor: nomeC,
      alteradaEm: '2026-10-15T22:30:00.000Z',
      jogadores: [
        { id: bira, apelido: 'Bira', situacao: 'presente' },
        { id: toninho, apelido: 'Toninho', situacao: 'ausente' },
      ],
    });
  });

  it('PAR-44: jogador inativo na data com presença gravada aparece na leitura', async () => {
    const { cenario } = aberto;
    const ze = cenario.idsG.jogadorInativo;
    await partida('2026-02-12', false, [[ze, 'lesionado']]);
    const r = await comoC((db) => partidas.ler(db, cenario.grupoG, '2026-02-12'));
    expect(r?.jogadores).toContainEqual({ id: ze, apelido: 'Zé Inativo', situacao: 'lesionado' });
  });

  it('PAR-44: jogador inativo na data e sem presença não aparece; quem entra depois também não', async () => {
    const { cenario } = aberto;
    const depois = await jogadorAtivo('Novato', '2026-06-01');
    await partida('2026-02-19', false);
    const r = await comoC((db) => partidas.ler(db, cenario.grupoG, '2026-02-19'));
    const ids = r?.jogadores.map((j) => j.id) ?? [];
    expect(ids).not.toContain(cenario.idsG.jogadorInativo);
    expect(ids).not.toContain(depois);
  });

  it('PAR-44: ordem pelo apelido sem acento nem caixa', async () => {
    const { cenario } = aberto;
    await jogadorAtivo('Álvaro', '2026-01-01');
    await jogadorAtivo('alberto', '2026-01-01');
    await jogadorAtivo('Éder', '2026-01-01');
    await partida('2026-02-26', false);
    const r = await comoC((db) => partidas.ler(db, cenario.grupoG, '2026-02-26'));
    expect(r?.jogadores.map((j) => j.apelido)).toEqual([
      'alberto',
      'Álvaro',
      'Bira',
      'Éder',
      'Toninho',
    ]);
  });

  it('PAR-44: sem partida na data, nulo; a conta de outro grupo também recebe nulo', async () => {
    const { cenario } = aberto;
    expect(await comoC((db) => partidas.ler(db, cenario.grupoG, '2026-02-06'))).toBeNull();
    expect(
      await comDb(aberto.url, cenario.contaB, (db) =>
        partidas.ler(db, cenario.grupoG, '2026-01-08'),
      ),
    ).toBeNull();
  });
});

describe('partidas.mesDaPrimeira', () => {
  it('PAR-41: o mês da primeira partida do grupo', async () => {
    const { cenario } = aberto;
    await partida('2025-11-20', false);
    expect(await comoC((db) => partidas.mesDaPrimeira(db, cenario.grupoG))).toBe('2025-11');
  });

  it('PAR-41: sem partida (grupo que a conta não vê), nulo', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaB, (db) => partidas.mesDaPrimeira(db, cenario.grupoG)),
    ).toBeNull();
  });
});
