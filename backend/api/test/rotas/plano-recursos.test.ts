import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { erroPlanoPro } from '@pelada/contrato';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { appFinanceiro, pedir } from './apoio-financeiro.ts';

/**
 * Travas Pro do simulador e do financeiro com o ponto único ligado ao plano (planos-e-cobranca T25; PLA-23, PLA-24,
 * PLA-28; AD-092), sem injeção: o `criarApp` usa o `recursoLiberadoPeloPlano` (T21) com o relógio fixo em 2026-11-20
 * (12h de São Paulo). G (de C, criadora com acesso ao financeiro) é posto como superusuário em cada situação; o
 * `afterAll` devolve a original. G tem 2 ativos (não fica somente leitura no Free).
 *
 * Evidência da rede (registrar na T25 do tasks.md, pelo /executar): tirar o `exigirRecurso('simulador')` de
 * `travarRecursosDoPlano` deixa vermelhos os 4 POST do simulador; tirar o `exigirRecursoNaEscrita('financeiro')` deixa
 * vermelho "POST …/financeiro/lancamentos 403".
 */

const AGORA = '2026-11-20T15:00:00.000Z';
const DATA_ESCALACAO = '2026-11-19';
const LANCAMENTO = {
  tipo: 'saida',
  data: '2026-11-10',
  descricao: 'Bola nova',
  valorCentavos: 12000,
};

let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null };
const app = appFinanceiro(AGORA);

async function situacao(s: string, t: string | null): Promise<void> {
  await aberto.db.query(
    'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
    [aberto.cenario.grupoG, s, t],
  );
}

const free = () => situacao('trial', '2026-10-01');

async function lancamentos(): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM lancamentos WHERE grupo_id = $1',
    [aberto.cenario.grupoG],
  );
  return r.rows[0]!.n;
}

const g = () => `/grupos/${aberto.cenario.grupoG}`;

/** Os 4 POST do simulador (AD-092, S-02). */
const POSTS_DO_SIMULADOR = [
  '/simulador/previa',
  '/simulador/sugerir',
  '/simulador/avaliar',
  '/escalacoes',
] as const;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoG],
  );
  original = r.rows[0]!;
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM escalacoes WHERE grupo_id = $1 AND data = $2', [
    aberto.cenario.grupoG,
    DATA_ESCALACAO,
  ]);
  await aberto.db.query(
    `DELETE FROM lancamentos WHERE grupo_id = $1 AND descricao = 'Bola nova' AND data = '2026-11-10'`,
    [aberto.cenario.grupoG],
  );
});

afterAll(async () => {
  if (aberto) {
    await situacao(original.s, original.t);
    await aberto.fechar();
  }
});

describe('simulador no Free (PLA-23)', () => {
  it.each(POSTS_DO_SIMULADOR)(
    'PLA-23: grupo Free → POST …%s 403 plano_pro (simulador)',
    async (caminho) => {
      await free();
      const r = await pedir(aberto, {
        app,
        metodo: 'POST',
        caminho: `${g()}${caminho}`,
        conta: aberto.cenario.contaC,
        corpo: {},
      });
      expect(r.status).toBe(403);
      expect(erroPlanoPro.parse(await r.json())).toMatchObject({
        erro: 'plano_pro',
        recurso: 'simulador',
      });
    },
  );

  it('PLA-23: a escalação confirmada no tempo de trial segue legível no Free (pré-marcação da partida)', async () => {
    const { db, cenario } = aberto;
    await situacao('trial', '2026-11-10');
    await db.query(
      `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
       VALUES ($1, $2, 'dois_times', 5, '{}'::jsonb, $3, now())`,
      [cenario.grupoG, DATA_ESCALACAO, cenario.contaC],
    );
    await free();
    const r = await pedir(aberto, {
      app,
      metodo: 'GET',
      caminho: `${g()}/partidas/nova?data=${DATA_ESCALACAO}`,
      conta: cenario.contaC,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ data: DATA_ESCALACAO, preMarcadaPelaEscalacao: true });
  });
});

describe('financeiro no Free (PLA-24)', () => {
  it('PLA-24: grupo Free → POST …/financeiro/lancamentos 403 plano_pro (financeiro) sem gravar', async () => {
    await free();
    const antes = await lancamentos();
    const r = await pedir(aberto, {
      app,
      metodo: 'POST',
      caminho: `${g()}/financeiro/lancamentos`,
      conta: aberto.cenario.contaC,
      corpo: LANCAMENTO,
    });
    expect(r.status).toBe(403);
    expect(erroPlanoPro.parse(await r.json())).toMatchObject({
      erro: 'plano_pro',
      recurso: 'financeiro',
    });
    expect(await lancamentos()).toBe(antes);
  });

  it('PLA-24: grupo Free → GET …/financeiro/mes 200', async () => {
    await free();
    const r = await pedir(aberto, {
      app,
      metodo: 'GET',
      caminho: `${g()}/financeiro/mes`,
      conta: aberto.cenario.contaC,
    });
    expect(r.status).toBe(200);
  });
});

describe('trial válido, Pro e cortesia (PLA-28)', () => {
  it.each([
    ['trial válido', 'trial', '2026-11-10'],
    ['ativo', 'ativo', null],
    ['uso_proprio', 'uso_proprio', null],
  ] as const)(
    'PLA-28: em %s, POST …/financeiro/lancamentos grava e o simulador não responde 403',
    async (_n, s, t) => {
      await situacao(s, t);
      const r = await pedir(aberto, {
        app,
        metodo: 'POST',
        caminho: `${g()}/financeiro/lancamentos`,
        conta: aberto.cenario.contaC,
        corpo: LANCAMENTO,
      });
      expect(r.status).toBe(201);
      const sim = await pedir(aberto, {
        app,
        metodo: 'POST',
        caminho: `${g()}/simulador/sugerir`,
        conta: aberto.cenario.contaC,
        corpo: {},
      });
      expect(sim.status).not.toBe(403);
      await aberto.db.query(
        `DELETE FROM lancamentos WHERE grupo_id = $1 AND descricao = 'Bola nova' AND data = '2026-11-10'`,
        [aberto.cenario.grupoG],
      );
    },
  );
});
