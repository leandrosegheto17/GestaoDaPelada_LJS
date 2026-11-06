import { Buffer } from 'node:buffer';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENSAGEM_APTOS_REPETIDO, MENSAGEM_N } from '@pelada/contrato';
import { previaResposta } from '@pelada/contrato/simulador';
import { criarApp } from '../../src/entrada/app.ts';
import type { ConexaoPg } from '../../src/infraestrutura/db/cliente.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/simulador/previa` (T34 da simulador; SIM-09, SIM-83), com o app real como `pelada_app` e
 * as consultas registradas (molde `sessao/grupo-ativo.test.ts:27`). Os aptos são ids quaisquer: a prévia só conta.
 */

let aberto: CenarioGruposAberto;
const consultas: string[] = [];

function fabricaEspiada(connectionString: string): ConexaoPg {
  const c = new pg.Client({ connectionString });
  return {
    connect: async () => {
      await c.connect();
      await c.query('SET ROLE pelada_app');
    },
    end: () => c.end(),
    query: (sql, valores) => {
      consultas.push(sql);
      return c.query(sql, valores);
    },
  };
}

const app = criarApp({
  fabricaBanco: fabricaEspiada,
  relogio: relogioFixo('2026-03-03T15:00:00Z'),
});

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function previa(corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  consultas.length = 0;
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/simulador/previa`,
    { method: 'POST', headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function aptosDois(n: number) {
  return Array.from({ length: n }, () => ({ id: crypto.randomUUID(), so1oTempo: false }));
}

function aptosVarios(n: number) {
  return Array.from({ length: n }, () => ({ id: crypto.randomUUID() }));
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

/** Tabelas de negócio que a prévia não pode ler nem gravar (SIM-09). */
const TABELAS_DE_NEGOCIO =
  /\b(jogadores|periodos_ativos|notas|habilidades|partidas|presencas|config_pesos|escalacoes|eventos_uso|auditoria)\b/;

describe('POST …/simulador/previa', () => {
  it('SIM-09: 19 aptos, N = 7 responde "2 times de 7 · 5 reservas" sem consultar tabela de negócio', async () => {
    const r = await previa({ formato: 'dois_times', n: 7, k: 2, aptos: aptosDois(19) });
    expect(r.status).toBe(200);
    const corpo = previaResposta.parse(await r.json());
    expect(corpo).toEqual({
      formato: 'dois_times',
      valida: true,
      descricao: '2 times de 7 · 5 reservas',
      times: 2,
      reservas: 5,
    });
    expect(consultas.length).toBeGreaterThan(0);
    expect(consultas.filter((s) => TABELAS_DE_NEGOCIO.test(s))).toEqual([]);
  });

  it('SIM-09: nada é gravado (sem INSERT, UPDATE nem DELETE)', async () => {
    await previa({ formato: 'dois_times', n: 7, k: 'ilimitado', aptos: aptosDois(19) });
    expect(consultas.filter((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s))).toEqual([]);
  });

  it('SIM-11: 2 times sem aptos suficientes devolve o maior N possível', async () => {
    const corpo = previaResposta.parse(
      await (await previa({ formato: 'dois_times', n: 11, k: 0, aptos: aptosDois(19) })).json(),
    );
    expect(corpo).toEqual({
      formato: 'dois_times',
      valida: false,
      motivo: 'aptos_insuficientes',
      descricao: 'Faltam aptos para 2 times de 11. Maior N possível: 9.',
      maiorNPossivel: 9,
    });
  });

  it('SIM-12: 3 ou mais com 18 aptos e N = 4: 4 completos e um incompleto de 2', async () => {
    const corpo = previaResposta.parse(
      await (await previa({ formato: 'varios_times', n: 4, aptos: aptosVarios(18) })).json(),
    );
    expect(corpo).toEqual({
      formato: 'varios_times',
      valida: true,
      descricao: '4 times de 4 + 1 time incompleto de 2',
      times: 5,
      timesCompletos: 4,
      tamanhoIncompleto: 2,
    });
  });

  it('SIM-13: 3 ou mais com 8 aptos e N = 4 é inválida, com N sugerido e 2 times possível', async () => {
    const corpo = previaResposta.parse(
      await (await previa({ formato: 'varios_times', n: 4, aptos: aptosVarios(8) })).json(),
    );
    expect(corpo).toEqual({
      formato: 'varios_times',
      valida: false,
      motivo: 'aptos_insuficientes',
      descricao: 'Com 8 aptos e N = 4 não há 3 times. Use N menor ou o formato 2 times.',
      nSugerido: 3,
      doisTimesPossivel: true,
    });
  });

  it('SIM-55: N fora de 2 a 11 dá 422 no campo n', async () => {
    const r = await previa({ formato: 'dois_times', n: 12, k: 0, aptos: aptosDois(4) });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      codigo: 'dados_invalidos',
      mensagens: { n: MENSAGEM_N },
    });
  });

  it('SIM-53: apto repetido dá 422 no campo aptos', async () => {
    const [um] = aptosDois(1);
    const r = await previa({ formato: 'dois_times', n: 2, k: 0, aptos: [um, um, ...aptosDois(2)] });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { aptos: MENSAGEM_APTOS_REPETIDO } });
  });

  it('SIM-33: 3 ou mais com k é recusado', async () => {
    const r = await previa({ formato: 'varios_times', n: 4, k: 2, aptos: aptosVarios(9) });
    expect(r.status).toBe(422);
  });

  it('SIM-83: grupo arquivado responde 409 grupo_arquivado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await previa({ formato: 'dois_times', n: 7, k: 2, aptos: aptosDois(19) });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
  });

  it('a conta B recebe 404 na prévia de G', async () => {
    const r = await previa(
      { formato: 'dois_times', n: 7, k: 2, aptos: aptosDois(19) },
      aberto.cenario.contaB,
    );
    expect(r.status).toBe(404);
  });
});
