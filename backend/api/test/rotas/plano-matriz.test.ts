import { Buffer } from 'node:buffer';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp, type OpcoesApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Free × trial × Pro × cortesia em cada rota travada (planos-e-cobranca T28; PLA-15, PLA-18, PLA-19, PLA-28), com o
 * app real como `pelada_app` e o relógio fixo em 2026-11-20 (12h de São Paulo). G (de C, com acesso ao financeiro)
 * ganha 19 ativos (21 no total) e é posto como superusuário em cada situação; o `afterAll` inativa os extras e devolve
 * a situação original.
 *
 * - Free (`trial` vencido desde 2026-10-15, com 21 ativos): cada linha responde 403 com o código da linha
 *   (`somente_leitura` / `limite_jogadores`, ou `plano_pro` com o recurso);
 * - `trial` válido, `ativo` e `uso_proprio`: a mesma requisição não responde 403 (o corpo é `{}` e os ids não existem,
 *   então a rota responde 404 ou 422 sem gravar);
 * - PLA-18: depois da rodada inteira, as contagens de linhas de G são as mesmas do início;
 * - meta-teste (PLA-28): toda rota de escrita registrada sob `/api/grupos/:grupoId` está na tabela ou na lista de
 *   rotas fora da trava; uma rota de prova sem linha reprova.
 *
 * Evidência da rede (registrar na T28 do tasks.md, pelo /executar): tirar o `exigirPlanoEditavel` da cadeia deixa
 * vermelhas as linhas `somente_leitura`; registrar uma rota de escrita nova sem linha deixa vermelho o meta-teste.
 */

const AGORA = '2026-11-20T15:00:00.000Z';
const URL_PUBLICA = 'https://pelada.exemplo.test';
const ID = '00000000-0000-4000-8000-0000000000aa';

type Esperado = { erro: 'somente_leitura'; motivo: 'limite_jogadores' } | { erro: 'plano_pro'; recurso: string };

interface Linha {
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Caminho como o Hono registra (`/api/grupos/:grupoId/...`). */
  rota: string;
  esperado: Esperado;
}

const SL: Esperado = { erro: 'somente_leitura', motivo: 'limite_jogadores' };
const SIM: Esperado = { erro: 'plano_pro', recurso: 'simulador' };
const FIN: Esperado = { erro: 'plano_pro', recurso: 'financeiro' };

/** A tabela das rotas travadas (AD-092; S-02, S-03). */
const TABELA: readonly Linha[] = [
  { metodo: 'PATCH', rota: '/api/grupos/:grupoId', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/jogadores', esperado: SL },
  { metodo: 'PATCH', rota: '/api/grupos/:grupoId/jogadores/:id', esperado: SL },
  { metodo: 'DELETE', rota: '/api/grupos/:grupoId/jogadores/:id', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/jogadores/:id/reativar', esperado: SL },
  { metodo: 'PATCH', rota: '/api/grupos/:grupoId/jogadores/:id/periodos/:periodoId', esperado: SL },
  { metodo: 'PUT', rota: '/api/grupos/:grupoId/jogadores/:id/inicio', esperado: SL },
  { metodo: 'PUT', rota: '/api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/habilidades', esperado: SL },
  { metodo: 'PATCH', rota: '/api/grupos/:grupoId/habilidades/:id', esperado: SL },
  { metodo: 'DELETE', rota: '/api/grupos/:grupoId/habilidades/:id', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/partidas', esperado: SL },
  { metodo: 'PUT', rota: '/api/grupos/:grupoId/partidas/:data', esperado: SL },
  { metodo: 'DELETE', rota: '/api/grupos/:grupoId/partidas/:data', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/pesos', esperado: SL },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/simulador/previa', esperado: SIM },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/simulador/sugerir', esperado: SIM },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/simulador/avaliar', esperado: SIM },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/escalacoes', esperado: SIM },
  { metodo: 'PUT', rota: '/api/grupos/:grupoId/financeiro/config', esperado: FIN },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/financeiro/pagamentos', esperado: FIN },
  { metodo: 'DELETE', rota: '/api/grupos/:grupoId/financeiro/pagamentos/:jogadorId/:mes', esperado: FIN },
  { metodo: 'POST', rota: '/api/grupos/:grupoId/financeiro/lancamentos', esperado: FIN },
  { metodo: 'PUT', rota: '/api/grupos/:grupoId/financeiro/lancamentos/:id', esperado: FIN },
  { metodo: 'DELETE', rota: '/api/grupos/:grupoId/financeiro/lancamentos/:id', esperado: FIN },
  { metodo: 'PATCH', rota: '/api/grupos/:grupoId/admins/:contaId/financeiro', esperado: FIN },
];

/** Escritas sob o grupo que ficam fora das travas de plano (AD-092): inativar, prévias, arquivar, admins, assinatura. */
const FORA: readonly string[] = [
  'POST /api/grupos/:grupoId/jogadores/:id/inativar',
  'POST /api/grupos/:grupoId/jogadores/:id/reativar/previa',
  'POST /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId/previa',
  'POST /api/grupos/:grupoId/jogadores/:id/inicio/previa',
  'POST /api/grupos/:grupoId/arquivar',
  'POST /api/grupos/:grupoId/reativar',
  'POST /api/grupos/:grupoId/admins/convites',
  'DELETE /api/grupos/:grupoId/admins/convites/:id',
  'DELETE /api/grupos/:grupoId/admins/:contaId',
  // Rotas da T33 e da T34 (ainda não registradas quando esta tabela nasce).
  'POST /api/grupos/:grupoId/assinatura',
  'DELETE /api/grupos/:grupoId/assinatura',
];

const SITUACOES_NORMAIS = [
  ['trial válido', 'trial', '2026-11-10'],
  ['ativo', 'ativo', null],
  ['uso_proprio', 'uso_proprio', null],
] as const;

let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null };
const extras: string[] = [];

function montar(opcoes: Pick<OpcoesApp, 'registrarExtras'> = {}): Hono<Ambiente> {
  return criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA), ...opcoes });
}

const app = montar();

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

function url(rota: string): string {
  return rota
    .replace('/api', '')
    .replace(':grupoId', aberto.cenario.grupoG)
    .replace(':data', '2026-11-19')
    .replace(':mes', '2026-11')
    .replace(/:[a-zA-Z]+/g, ID);
}

async function pedir(metodo: string, caminho: string, token: string): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', 'content-type': 'application/json', cookie: `${NOME_COOKIE_SESSAO}=${token}` });
  const ctx = contextoFalso();
  const r = await app.request(`/api${caminho}`, { method: metodo, headers, body: '{}' }, envAcesso(aberto.url, { URL_PUBLICA }), ctx);
  await ctx.esperar();
  return r;
}

async function pdf(): Promise<Response> {
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${aberto.cenario.slugG}/pdf?mes=2026-01`,
    { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.9' } },
    envAcesso(aberto.url, { URL_PUBLICA }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function situacao(s: string, t: string | null): Promise<void> {
  await aberto.db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1', [
    aberto.cenario.grupoG,
    s,
    t,
  ]);
}

/** Linhas de G nas tabelas que as rotas da tabela escrevem (PLA-18). */
async function contagens(): Promise<Record<string, number>> {
  const tabelas = [
    'jogadores',
    'periodos_ativos',
    'habilidades',
    'notas',
    'partidas',
    'config_pesos',
    'escalacoes',
    'config_financeira',
    'lancamentos',
    'pagamentos_mes',
    'auditoria',
  ];
  const saida: Record<string, number> = {};
  for (const t of tabelas) {
    const r = await aberto.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE grupo_id = $1`, [
      aberto.cenario.grupoG,
    ]);
    saida[t] = r.rows[0]!.n;
  }
  const g = await aberto.db.query<{ g: string }>(
    `SELECT row_to_json(x)::text AS g FROM (SELECT nome, dia_semana, frequencia, horario FROM grupos WHERE id = $1) x`,
    [aberto.cenario.grupoG],
  );
  saida[`grupo:${g.rows[0]!.g}`] = 1;
  return saida;
}

/** Rotas de escrita registradas sob o grupo que não estão nem na tabela nem em `FORA`. */
function rotasSemLinha(a: Hono<Ambiente>): string[] {
  const conhecidas = new Set([...TABELA.map((l) => `${l.metodo} ${l.rota}`), ...FORA]);
  return [
    ...new Set(
      a.routes
        .filter((r) => !['ALL', 'GET', 'HEAD', 'OPTIONS'].includes(r.method))
        .filter((r) => /^\/api\/grupos\/:grupoId(\/|$)/.test(r.path))
        .map((r) => `${r.method} ${r.path}`),
    ),
  ]
    .filter((r) => !conhecidas.has(r))
    .sort();
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const r = await db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [cenario.grupoG],
  );
  original = r.rows[0]!;
  for (let i = 0; i < 19; i++) {
    const j = await db.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
      [cenario.grupoG, `Matriz ${i + 1}`, cenario.contaC],
    );
    extras.push(j.rows[0]!.id);
    await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`, [
      j.rows[0]!.id,
      cenario.grupoG,
    ]);
  }
});

afterAll(async () => {
  if (aberto) {
    await aberto.db.query(
      `UPDATE periodos_ativos SET fim = '2026-01-02' WHERE jogador_id = ANY($1::uuid[]) AND fim IS NULL`,
      [extras],
    );
    await situacao(original.s, original.t);
    await aberto.fechar();
  }
});

describe('matriz de plano por rota (PLA-28)', () => {
  it('PLA-28 e PLA-18: cada linha da tabela × 4 situações, sem mudar nada de G', async () => {
    const antes = await contagens();
    const token = await sessao(aberto.cenario.contaC);
    const falhas: string[] = [];

    await situacao('trial', '2026-10-01');
    for (const l of TABELA) {
      const r = await pedir(l.metodo, url(l.rota), token);
      const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = r.status === 403 && Object.entries(l.esperado).every(([k, v]) => corpo[k] === v);
      if (!ok) falhas.push(`Free ${l.metodo} ${l.rota}: ${r.status} ${JSON.stringify(corpo)}`);
    }

    for (const [nome, s, t] of SITUACOES_NORMAIS) {
      await situacao(s, t);
      for (const l of TABELA) {
        const r = await pedir(l.metodo, url(l.rota), token);
        if (r.status === 403) falhas.push(`${nome} ${l.metodo} ${l.rota}: 403 ${await r.text()}`);
      }
    }

    expect(falhas).toEqual([]);
    expect(await contagens()).toEqual(antes);
  });

  it('PLA-28 e PLA-19: PDF público no Free 403 plano_pro (pdf); nas outras 3 situações, 200', async () => {
    await situacao('trial', '2026-10-01');
    const free = await pdf();
    expect(free.status).toBe(403);
    expect(await free.json()).toMatchObject({ erro: 'plano_pro', recurso: 'pdf' });
    for (const [, s, t] of SITUACOES_NORMAIS) {
      await situacao(s, t);
      expect((await pdf()).status).toBe(200);
    }
  });
});

describe('meta-teste da tabela (PLA-28)', () => {
  it('PLA-28: toda rota de escrita sob /api/grupos/:grupoId tem linha na tabela ou em FORA', () => {
    expect(rotasSemLinha(app)).toEqual([]);
  });

  it('PLA-28: o meta-teste falha com uma rota de escrita de prova sem linha', () => {
    const comProva = montar({
      registrarExtras: (api) => {
        api.post('/grupos/:grupoId/rota-de-prova', (c) => c.json({ ok: true }, 200));
      },
    });
    expect(rotasSemLinha(comProva)).toEqual(['POST /api/grupos/:grupoId/rota-de-prova']);
  });

  it('PLA-28: a tabela não cita rota que o app não registra', () => {
    const registradas = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
    expect(TABELA.map((l) => `${l.metodo} ${l.rota}`).filter((r) => !registradas.has(r))).toEqual([]);
  });
});
