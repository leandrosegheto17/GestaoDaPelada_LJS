import { previaDoInicio, previaDosPeriodos, type Periodo } from '@pelada/dominio';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { historico } from '../../src/infraestrutura/db/repositorios/historico.ts';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Auditoria das escritas de período com acumulado e posição (T35; PAR-122), contra o cenário de grupos. Cada caso cria,
 * como superusuário, um jogador de G com presença numa partida de 2026-02-05 (para o acumulado não ser trivial),
 * calcula a prévia do mesmo cenário sobre o histórico lido antes da escrita e confere que a auditoria grava os mesmos
 * quatro números. "Hoje" é 2026-11-05.
 */

const HOJE = '2026-11-05';
const CAMPOS = ['acumuladoAntes', 'acumuladoDepois', 'posicaoAntes', 'posicaoDepois'] as const;

let aberto: CenarioGruposAberto;
const criados: string[] = [];
let partidaId = '';

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query('DELETE FROM partidas WHERE id = $1', [partidaId]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
  await db.query(
    `DELETE FROM auditoria WHERE acao IN ('jogador_reativado', 'jogador_periodo_corrigido', 'jogador_inicio_alterado')`,
  );
});

/** Jogador de G com os períodos e o início dados, presente na partida de 2026-02-05 (criada aqui). */
async function jogadorComHistorico(periodos: Periodo[], inicio: string): Promise<string> {
  const { db, cenario } = aberto;
  const j = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Auditado', 1990, 'atacante', 10, $2, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, inicio, cenario.contaC],
  );
  const id = j.rows[0]?.id ?? '';
  criados.push(id);
  for (const p of periodos) {
    await db.query('INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4)', [
      id,
      cenario.grupoG,
      p.inicio,
      p.fim,
    ]);
  }
  const pt = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, '2026-02-05', false, $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoG, cenario.contaC],
  );
  partidaId = pt.rows[0]?.id ?? '';
  await db.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
    partidaId,
    id,
    cenario.grupoG,
  ]);
  return id;
}

/** O histórico de G como a conta C o vê agora, numa transação desfeita. */
function historicoAgora() {
  return comDb(aberto.url, aberto.cenario.contaC, (db) => historico.carregar(db, aberto.cenario.grupoG, HOJE));
}

async function resumoDe(acao: string, id: string): Promise<Record<string, unknown> | undefined> {
  const r = await aberto.db.query<{ resumo: Record<string, unknown> }>(
    'SELECT resumo FROM auditoria WHERE acao = $1 AND entidade_id = $2',
    [acao, id],
  );
  return r.rows[0]?.resumo;
}

function soCenarios(c: Record<string, unknown>) {
  return Object.fromEntries(CAMPOS.map((k) => [k, c[k]]));
}

describe('auditoria das escritas de período com acumulado e posição', () => {
  it('PAR-122: reativar grava na auditoria os quatro valores, iguais aos da prévia do mesmo cenário', async () => {
    const { cenario } = aberto;
    const antes: Periodo[] = [{ inicio: '2026-01-10', fim: '2026-03-01' }];
    const id = await jogadorComHistorico(antes, '2026-01-10');
    const previa = previaDosPeriodos(await historicoAgora(), id, [...antes, { inicio: '2026-10-01', fim: null }], HOJE);

    const r = await comDb(
      aberto.url,
      cenario.contaC,
      (db) => jogadores.reativar(db, cenario.grupoG, id, { data: '2026-10-01' }, HOJE),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    const resumo = await resumoDe('jogador_reativado', id);
    expect(resumo).toMatchObject({ retorno: '2026-10-01', saidaAnterior: '2026-03-01' });
    expect(soCenarios(resumo ?? {})).toEqual(soCenarios({ ...previa }));
    expect(previa.posicaoAntes, 'inativo hoje: sem posição antes').toBeNull();
    expect(previa.posicaoDepois, 'reativado: ganha posição').not.toBeNull();
  });

  it('PAR-122: corrigir período grava os quatro valores, iguais aos da prévia do mesmo cenário', async () => {
    const { cenario } = aberto;
    const antes: Periodo[] = [
      { inicio: '2026-01-10', fim: '2026-03-01' },
      { inicio: '2026-04-01', fim: null },
    ];
    const id = await jogadorComHistorico(antes, '2026-01-10');
    const r0 = await aberto.db.query<{ id: string }>(
      `SELECT id FROM periodos_ativos WHERE jogador_id = $1 AND inicio = '2026-01-10'`,
      [id],
    );
    const periodoId = r0.rows[0]?.id ?? '';
    const depois: Periodo[] = [
      { inicio: '2026-01-10', fim: '2026-02-20' },
      { inicio: '2026-04-01', fim: null },
    ];
    const previa = previaDosPeriodos(await historicoAgora(), id, depois, HOJE);

    const r = await comDb(
      aberto.url,
      cenario.contaC,
      (db) => jogadores.corrigirPeriodo(db, cenario.grupoG, id, periodoId, { saida: '2026-02-20' }, HOJE),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(soCenarios((await resumoDe('jogador_periodo_corrigido', id)) ?? {})).toEqual(soCenarios({ ...previa }));
  });

  it('PAR-122: alterar o início grava os quatro valores, iguais aos da prévia de início', async () => {
    const { cenario } = aberto;
    const id = await jogadorComHistorico([{ inicio: '2026-01-10', fim: null }], '2026-02-06');
    const previa = previaDoInicio(await historicoAgora(), id, '2026-02-01', HOJE);
    expect(previa.acumuladoDepois, 'a presença de 05/02 passa a contar').not.toBe(previa.acumuladoAntes);

    const r = await comDb(
      aberto.url,
      cenario.contaC,
      (db) => jogadores.alterarInicio(db, cenario.grupoG, id, { data: '2026-02-01' }, HOJE),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    const resumo = await resumoDe('jogador_inicio_alterado', id);
    expect(resumo).toMatchObject({ anterior: '2026-02-06', nova: '2026-02-01' });
    expect(soCenarios(resumo ?? {})).toEqual(soCenarios({ ...previa }));
  });

  it('PAR-122: escrita sem mudança (datas iguais) não audita, então não lê o histórico', async () => {
    const { cenario } = aberto;
    const id = await jogadorComHistorico([{ inicio: '2026-01-10', fim: null }], '2026-02-06');
    const r = await comDb(
      aberto.url,
      cenario.contaC,
      (db) => jogadores.alterarInicio(db, cenario.grupoG, id, { data: '2026-02-06' }, HOJE),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', alterado: false });
    expect(await resumoDe('jogador_inicio_alterado', id)).toBeUndefined();
  });
});
