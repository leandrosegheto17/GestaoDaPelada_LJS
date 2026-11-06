import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENSAGEM_PESO, MENSAGEM_REFLETIR, pesosPainel } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `GET` e `POST /api/grupos/:grupoId/pesos` (partidas-e-ranking T38; PAR-01, PAR-03, PAR-06, PAR-07, PAR-08), com o
 * app real como `pelada_app` e o relógio fixo em 14/03/2026 (12h de São Paulo). O cenário de grupos grava em G uma
 * configuração de 2026-01-01 (3, 4, 1, 2, -1, padrão do expulso com chuva); o `afterEach` apaga a de hoje.
 */

let aberto: CenarioGruposAberto;

const HOJE = '2026-03-14';
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-14T15:00:00Z'),
});

const VALIDO = {
  presencaSemChuva: 5,
  presencaComChuva: 6,
  lesionadoSemChuva: 2,
  lesionadoComChuva: 3,
  expulsoSemChuva: -2,
  expulsoComChuva: -3,
  refletirNoPassado: false,
} as const;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(
  metodo: 'GET' | 'POST',
  conta = aberto.cenario.contaC,
  corpo?: unknown,
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/pesos`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function configsDeHoje(): Promise<number> {
  const r = await aberto.db.query(
    'SELECT 1 FROM config_pesos WHERE grupo_id = $1 AND vigente_desde = $2',
    [aberto.cenario.grupoG, HOJE],
  );
  return r.rowCount ?? 0;
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

afterEach(async () => {
  // A resposta "sim" (PAR-164) troca os pesos da configuração do cenário: volta ao valor original.
  await aberto.db.query(
    `UPDATE config_pesos SET presenca_sem_chuva = 3, presenca_com_chuva = 4, lesionado_sem_chuva = 1,
            lesionado_com_chuva = 2, expulso = -1, registrado_por = $2
      WHERE grupo_id = $1 AND vigente_desde = '2026-01-01'`,
    [aberto.cenario.grupoG, aberto.cenario.contaC],
  );
  await aberto.db.query('DELETE FROM config_pesos WHERE grupo_id = $1 AND vigente_desde = $2', [
    aberto.cenario.grupoG,
    HOJE,
  ]);
});

describe('GET /api/grupos/:grupoId/pesos', () => {
  it('PAR-01: responde 200 com hoje, a vigente de 2026-01-01 e quem registrou', async () => {
    const r = await pedir('GET');
    expect(r.status).toBe(200);
    const painel = pesosPainel.parse(await r.json());
    expect(painel.hoje).toBe(HOJE);
    expect(painel.vigente).toMatchObject({
      presencaSemChuva: 3,
      presencaComChuva: 4,
      lesionadoSemChuva: 1,
      lesionadoComChuva: 2,
      expulsoSemChuva: -1,
      vigenteDesde: '2026-01-01',
    });
  });
});

describe('POST /api/grupos/:grupoId/pesos', () => {
  it('PAR-03: POST válido responde 200 com o painel e vigente.vigenteDesde = hoje do relógio fixo', async () => {
    const r = await pedir('POST', aberto.cenario.contaC, VALIDO);
    expect(r.status).toBe(200);
    const painel = pesosPainel.parse(await r.json());
    expect(painel.hoje).toBe(HOJE);
    const { refletirNoPassado: _r, ...pesosEnviados } = VALIDO;
    expect(painel.vigente).toMatchObject({ ...pesosEnviados, vigenteDesde: HOJE });
    expect(painel.historico[0]).toMatchObject({
      vigenteDesde: '2026-01-01',
      vigenteAte: '2026-03-13',
    });
    expect(await configsDeHoje()).toBe(1);
  });

  it('PAR-03: a outra admin também salva, e o painel diz o nome dela', async () => {
    const r = await pedir('POST', aberto.cenario.contaO, VALIDO);
    expect(r.status).toBe(200);
    expect(pesosPainel.parse(await r.json()).vigente.registradoPor).toBe('Outra Admin');
  });

  it('PAR-164: refletirNoPassado true responde 200 e a configuração de 2026-01-01 passa a ter os pesos novos', async () => {
    const r = await pedir('POST', aberto.cenario.contaC, { ...VALIDO, refletirNoPassado: true });
    expect(r.status).toBe(200);
    const painel = pesosPainel.parse(await r.json());
    expect(painel.vigente).toMatchObject({ presencaSemChuva: 5, vigenteDesde: '2026-01-01' });
    // Todas as configurações do grupo (a de 1900-01-01 da grupo_criar inclusive) ganham os pesos novos.
    expect(painel.historico.every((c) => c.presencaSemChuva === 5)).toBe(true);
    expect(await configsDeHoje()).toBe(0);
  });

  it('PAR-163: refletirNoPassado false mantém a de 2026-01-01 e acrescenta a de hoje', async () => {
    const r = await pedir('POST', aberto.cenario.contaC, VALIDO);
    expect(r.status).toBe(200);
    const painel = pesosPainel.parse(await r.json());
    expect(painel.historico[0]).toMatchObject({ vigenteDesde: '2026-01-01', presencaSemChuva: 3 });
  });

  it.each([
    ['ausente', undefined],
    ['texto', 'sim'],
    ['número', 1],
    ['nulo', null],
  ])('PAR-162: refletirNoPassado %s responde 422 no campo, sem gravar', async (_nome, valor) => {
    const { refletirNoPassado: _fora, ...semCampo } = VALIDO;
    const corpo = valor === undefined ? semCampo : { ...semCampo, refletirNoPassado: valor };
    const r = await pedir('POST', aberto.cenario.contaC, corpo);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { refletirNoPassado: MENSAGEM_REFLETIR } });
    expect(await configsDeHoje()).toBe(0);
    const base = pesosPainel.parse(await (await pedir('GET')).json());
    expect(base.vigente.presencaSemChuva).toBe(3);
  });

  it('PAR-08: corpo com vigenteDesde responde 422 sem gravar', async () => {
    const r = await pedir('POST', aberto.cenario.contaC, { ...VALIDO, vigenteDesde: '2026-01-01' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos' });
    expect(await configsDeHoje()).toBe(0);
  });

  it('PAR-08: qualquer outro campo também é recusado sem gravar', async () => {
    const r = await pedir('POST', aberto.cenario.contaC, {
      ...VALIDO,
      grupoId: aberto.cenario.grupoH,
    });
    expect(r.status).toBe(422);
    expect(await configsDeHoje()).toBe(0);
  });

  it.each([
    ['10,5', 10.5],
    ['11', 11],
    ['-11', -11],
    ['texto', '3'],
  ])('PAR-06: peso %s responde 422 no campo com a mensagem, sem gravar', async (_nome, valor) => {
    const r = await pedir('POST', aberto.cenario.contaC, { ...VALIDO, lesionadoComChuva: valor });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { lesionadoComChuva: MENSAGEM_PESO } });
    expect(await configsDeHoje()).toBe(0);
  });

  it('PAR-07: peso ausente responde 422 no campo que falta', async () => {
    const { expulsoComChuva: _fora, ...semUm } = VALIDO;
    const r = await pedir('POST', aberto.cenario.contaC, semUm);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['expulsoComChuva'] });
    expect(await configsDeHoje()).toBe(0);
  });
});

describe('cadeia do grupo nos pesos', () => {
  it.each(['GET', 'POST'] as const)('PAR-01: %s sem vínculo responde 404', async (metodo) => {
    const r = await pedir(metodo, aberto.cenario.contaB, metodo === 'POST' ? VALIDO : undefined);
    expect(r.status).toBe(404);
    expect(await configsDeHoje()).toBe(0);
  });

  it('PAR-03: POST em grupo arquivado responde 409 grupo_arquivado sem gravar', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir('POST', aberto.cenario.contaC, VALIDO);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await configsDeHoje()).toBe(0);
  });
});
