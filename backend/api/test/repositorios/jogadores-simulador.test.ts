import { PostgresQueryCompiler, sql, type KyselyPlugin } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadoresLeitura } from '../../src/infraestrutura/db/repositorios/jogadores-leitura.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Aptos do simulador na data (T27 da simulador; SIM-01, SIM-02, SIM-03), contra o cenário de grupos. Em G: Toninho
 * (ativo desde 2026-01-01, sem nota), Zé Inativo (2025-03-01 a 2025-12-31) e Bira (ativo desde 2026-01-01, nota 7).
 * Os jogadores criados por um caso (como superusuário) saem no `afterEach`.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
});

/** O `Db` que registra o SQL compilado de cada consulta. */
function espiando(db: Db): { db: Db; consultas: string[] } {
  const consultas: string[] = [];
  const compilador = new PostgresQueryCompiler();
  const plugin: KyselyPlugin = {
    transformQuery: (args) => {
      consultas.push(compilador.compileQuery(args.node, args.queryId).sql);
      return args.node;
    },
    transformResult: async (args) => args.result,
  };
  return { db: db.withPlugin(plugin), consultas };
}

async function novoJogador(
  apelido: string,
  periodos: Array<[string, string | null]>,
  ano: number | null = 1990,
  grupo = aberto.cenario.grupoG,
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, 'meia', '11999990000', 0, $4, now(), $4, now()) RETURNING id`,
    [grupo, apelido, ano, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  for (const [inicio, fim] of periodos) {
    await db.query('INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4)', [
      id,
      grupo,
      inicio,
      fim,
    ]);
  }
  criados.push(id);
  return id;
}

function aptosEm(data: string, conta = aberto.cenario.contaC, grupo = aberto.cenario.grupoG) {
  return comDb(aberto.url, conta, (db) => jogadoresLeitura.paraSimulador(db, grupo, data));
}

describe('jogadoresLeitura.paraSimulador', () => {
  it('SIM-01: os ativos na data, com nível e semNota; o inativo fica de fora', async () => {
    const { cenario } = aberto;
    const aptos = await aptosEm('2026-03-05');
    expect(aptos.map((a) => a.id).sort()).toEqual([cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico].sort());
    expect(aptos.find((a) => a.id === cenario.idsG.jogadorAtivo)).toMatchObject({ nivel: 550, semNota: true });
    expect(aptos.find((a) => a.id === cenario.idsG.jogadorHistorico)).toMatchObject({ nivel: 700, semNota: false });
  });

  it('SIM-02: período que termina na data não aparece; o que começa na data aparece', async () => {
    const termina = await novoJogador('Termina Hoje', [['2026-01-01', '2026-03-05']]);
    const comeca = await novoJogador('Começa Hoje', [['2026-03-05', null]]);
    const ids = (await aptosEm('2026-03-05')).map((a) => a.id);
    expect(ids).not.toContain(termina);
    expect(ids).toContain(comeca);
  });

  it('SIM-02: quem saiu e voltou é apto só nas datas de algum período', async () => {
    const voltou = await novoJogador('Voltou', [
      ['2026-01-01', '2026-02-01'],
      ['2026-03-01', null],
    ]);
    expect((await aptosEm('2026-01-15')).map((a) => a.id)).toContain(voltou);
    expect((await aptosEm('2026-02-15')).map((a) => a.id)).not.toContain(voltou);
    expect((await aptosEm('2026-03-15')).map((a) => a.id)).toContain(voltou);
  });

  it('SIM-02: a data muda quem é apto (o inativo de 2025 é apto em 2025-06-01)', async () => {
    const { cenario } = aberto;
    const ids = (await aptosEm('2025-06-01')).map((a) => a.id);
    expect(ids).toEqual([cenario.idsG.jogadorInativo]);
  });

  it('SIM-03: na ordem do apelido sem acento nem caixa', async () => {
    await novoJogador('álvaro', [['2026-01-01', null]]);
    await novoJogador('Caio', [['2026-01-01', null]]);
    expect((await aptosEm('2026-03-05')).map((a) => a.apelido)).toEqual(['álvaro', 'Bira', 'Caio', 'Toninho']);
  });

  it('SIM-03: cada apto traz só id, apelido, ano, nível e semNota', async () => {
    for (const apto of await aptosEm('2026-03-05')) {
      expect(Object.keys(apto).sort()).toEqual(['anoNascimento', 'apelido', 'id', 'nivel', 'semNota']);
    }
  });

  it('SIM-95: jogador sem ano sai com anoNascimento nulo', async () => {
    const semAno = await novoJogador('Sem Ano', [['2026-01-01', null]], null);
    expect((await aptosEm('2026-03-05')).find((a) => a.id === semAno)).toMatchObject({ anoNascimento: null });
  });

  it('SIM-03: as consultas não leem telefone nem posição', async () => {
    const { cenario } = aberto;
    const consultas = await comDb(aberto.url, cenario.contaC, async (db) => {
      const espiado = espiando(db);
      await jogadoresLeitura.paraSimulador(espiado.db, cenario.grupoG, '2026-03-05');
      return espiado.consultas;
    });
    expect(consultas.length).toBeGreaterThan(0);
    for (const consulta of consultas) {
      expect(consulta).not.toMatch(/telefone/i);
      expect(consulta).not.toMatch(/posicao/i);
    }
  });

  it('SIM-01: 30 jogadores em exatamente 2 consultas', async () => {
    const { cenario } = aberto;
    const r = await comDb(aberto.url, cenario.contaC, async (db) => {
      for (let i = 0; i < 28; i += 1) {
        const novo = await sql<{ id: string }>`
          INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                                 alterado_por, alterado_em)
          VALUES (${cenario.grupoG}, ${`Jogador ${String(i).padStart(2, '0')}`}, 1990, 'meia', 0, ${cenario.contaC}, now(),
                  ${cenario.contaC}, now())
          RETURNING id`.execute(db);
        await sql`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio)
                  VALUES (${novo.rows[0]!.id}, ${cenario.grupoG}, '2026-02-01')`.execute(db);
      }
      const espiado = espiando(db);
      const aptos = await jogadoresLeitura.paraSimulador(espiado.db, cenario.grupoG, '2026-03-05');
      return { total: aptos.length, consultas: espiado.consultas.length };
    });
    expect(r.total).toBe(30);
    expect(r.consultas).toBe(2);
  });

  it('jogador de outro grupo não aparece', async () => {
    const { cenario } = aberto;
    const deH = await novoJogador('Do Grupo H', [['2026-01-01', null]], 1990, cenario.grupoH);
    expect((await aptosEm('2026-03-05')).map((a) => a.id)).not.toContain(deH);
  });

  it('a conta B não lê os aptos de G (RLS)', async () => {
    const { cenario } = aberto;
    expect(await aptosEm('2026-03-05', cenario.contaB, cenario.grupoG)).toEqual([]);
  });
});
