import { sql, type KyselyPlugin } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jogadoresLeitura } from '../../src/infraestrutura/db/repositorios/jogadores-leitura.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Leitura de jogadores (T33; GEL-46, GEL-50, GEL-102), contra o cenário de grupos. Em G: Toninho (ativo desde
 * 2026-01-01, sem nota), Zé Inativo (2025-03-01 a 2025-12-31, sem nota) e Bira (ativo desde 2026-01-01, nota 7 na
 * primeira habilidade). Cada caso numa transação como `pelada_app`, desfeita no fim.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** O `Db` com um contador de consultas (cada `execute` passa uma vez pelo `transformQuery`). */
function contando(db: Db): { db: Db; consultas: () => number } {
  let n = 0;
  const plugin: KyselyPlugin = {
    transformQuery: (args) => {
      n += 1;
      return args.node;
    },
    transformResult: async (args) => args.result,
  };
  return { db: db.withPlugin(plugin), consultas: () => n };
}

describe('jogadoresLeitura.listar', () => {
  it('GEL-46: cada item traz id, apelido, posição, situação, desde, nível e semNota', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.listar(db, cenario.grupoG));
    expect(lista).toHaveLength(3);
    for (const j of lista) {
      expect(Object.keys(j).sort()).toEqual(['apelido', 'desde', 'id', 'nivel', 'posicao', 'semNota', 'situacao']);
    }
    expect(lista.find((j) => j.id === cenario.idsG.jogadorAtivo)).toMatchObject({
      apelido: 'Toninho',
      situacao: 'ativo',
      desde: '2026-01-01',
    });
  });

  it('GEL-50: jogador com período encerrado sai como inativo desde a data de saída', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.listar(db, cenario.grupoG));
    expect(lista.find((j) => j.id === cenario.idsG.jogadorInativo)).toMatchObject({ situacao: 'inativo', desde: '2025-12-31' });
  });

  it('GEL-50: quem saiu e voltou é ativo desde o retorno, não desde o primeiro período', async () => {
    const { url, cenario } = aberto;
    const item = await comDb(url, cenario.contaC, async (db) => {
      await sql`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim)
                VALUES (${cenario.idsG.jogadorInativo}, ${cenario.grupoG}, '2026-03-01', NULL)`.execute(db);
      return (await jogadoresLeitura.listar(db, cenario.grupoG)).find((j) => j.id === cenario.idsG.jogadorInativo);
    });
    expect(item).toMatchObject({ situacao: 'ativo', desde: '2026-03-01' });
  });

  it('GEL-102: jogador sem nota sai com 550 e semNota', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.listar(db, cenario.grupoG));
    expect(lista.find((j) => j.id === cenario.idsG.jogadorAtivo)).toMatchObject({ nivel: 550, semNota: true });
  });

  it('GEL-101: jogador com nota 7 sai com nível 700 e sem semNota', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.listar(db, cenario.grupoG));
    expect(lista.find((j) => j.id === cenario.idsG.jogadorHistorico)).toMatchObject({ nivel: 700, semNota: false });
  });

  it('GEL-47: a lista sai na ordem do apelido sem acento e sem caixa', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.listar(db, cenario.grupoG));
    expect(lista.map((j) => j.apelido)).toEqual(['Bira', 'Toninho', 'Zé Inativo']);
  });

  it('GEL-44: o grupo H não traz os jogadores de G', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaB, (db) => jogadoresLeitura.listar(db, cenario.grupoH));
    expect(lista.map((j) => j.id)).not.toContain(cenario.idsG.jogadorAtivo);
  });

  it('GEL-46: listar 30 jogadores faz exatamente 2 consultas', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaC, async (db) => {
      for (let i = 0; i < 27; i += 1) {
        const novo = await sql<{ id: string }>`
          INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                                 alterado_por, alterado_em)
          VALUES (${cenario.grupoG}, ${`Jogador ${String(i).padStart(2, '0')}`}, 1990, 'meia', 0, ${cenario.contaC}, now(),
                  ${cenario.contaC}, now())
          RETURNING id`.execute(db);
        await sql`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES (${novo.rows[0]!.id}, ${cenario.grupoG}, '2026-02-01')`.execute(
          db,
        );
      }
      const espiado = contando(db);
      const lista = await jogadoresLeitura.listar(espiado.db, cenario.grupoG);
      return { total: lista.length, consultas: espiado.consultas() };
    });
    expect(r.total).toBe(30);
    expect(r.consultas).toBe(2);
  });
});

describe('jogadoresLeitura.ler', () => {
  it('GEL-46: a ficha traz os períodos, as notas por habilidade e os dados do jogador', async () => {
    const { url, cenario } = aberto;
    const ficha = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.ler(db, cenario.grupoG, cenario.idsG.jogadorHistorico));
    expect(ficha).toMatchObject({ id: cenario.idsG.jogadorHistorico, apelido: 'Bira', situacao: 'ativo', nivel: 700 });
    expect(ficha?.periodos).toEqual([expect.objectContaining({ inicio: '2026-01-01', fim: null })]);
    expect(ficha?.notas).toHaveLength(6);
    expect(ficha?.notas[0]).toMatchObject({ habilidadeId: cenario.idsG.habilidade, habilidade: 'Visão de Jogo', nota: 7 });
    expect(ficha?.notas.slice(1).every((n) => n.nota === null)).toBe(true);
  });

  it('GEL-50: a ficha do inativo diz inativo desde a saída, com o período encerrado', async () => {
    const { url, cenario } = aberto;
    const ficha = await comDb(url, cenario.contaC, (db) => jogadoresLeitura.ler(db, cenario.grupoG, cenario.idsG.jogadorInativo));
    expect(ficha).toMatchObject({ situacao: 'inativo', desde: '2025-12-31', semNota: true, nivel: 550 });
    expect(ficha?.periodos).toEqual([expect.objectContaining({ inicio: '2025-03-01', fim: '2025-12-31' })]);
  });

  it('GEL-44: jogador de G pedido pelo grupo H é nulo', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, cenario.contaB, (db) => jogadoresLeitura.ler(db, cenario.grupoH, cenario.idsG.jogadorAtivo))).toBeNull();
  });
});
