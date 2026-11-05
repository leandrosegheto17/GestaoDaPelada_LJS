import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  MENSAGEM_APELIDO,
  MENSAGEM_DATA_ANTES_DO_PISO,
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_PONTUACAO,
  MENSAGEM_POSICAO,
  MENSAGEM_TELEFONE,
  mensagemAnoNascimento,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { MENSAGEM_APELIDO_REPETIDO } from '../../src/entrada/corpo.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET` e `POST /api/grupos/:grupoId/jogadores` (T36; GEL-31, GEL-33, GEL-34, GEL-36, GEL-37, GEL-39, GEL-40, GEL-46,
 * SEC-002), com o app real como `pelada_app` e o relógio fixo em 15/06/2026 (12h de São Paulo). O ano máximo de
 * nascimento é 2016 (hoje − 10). O `afterEach` apaga os jogadores criados.
 */

let aberto: CenarioGruposAberto;

const HOJE = '2026-06-15';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-06-15T15:00:00Z') });

const VALIDO = { apelido: 'Recruta', anoNascimento: 1998, posicao: 'volante' } as const;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(caminho: string, conta: string, metodo = 'GET', corpo?: unknown): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api${caminho}`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function cadastrar(corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  return pedir(`/grupos/${aberto.cenario.grupoG}/jogadores`, conta, 'POST', corpo);
}

async function existe(apelido: string): Promise<boolean> {
  const r = await aberto.db.query('SELECT 1 FROM jogadores WHERE grupo_id = $1 AND apelido = $2', [aberto.cenario.grupoG, apelido]);
  return (r.rowCount ?? 0) > 0;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM jogadores WHERE grupo_id = $1 AND id NOT IN ($2, $3, $4)`, [
    cenario.grupoG,
    cenario.idsG.jogadorAtivo,
    cenario.idsG.jogadorInativo,
    cenario.idsG.jogadorHistorico,
  ]);
});

describe('POST /api/grupos/:grupoId/jogadores', () => {
  it('GEL-31: 201 com o jogador criado, ativo desde hoje, pontuação 0 e sem telefone', async () => {
    const r = await cadastrar(VALIDO);
    expect(r.status).toBe(201);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({
      apelido: 'Recruta',
      posicao: 'volante',
      situacao: 'ativo',
      desde: HOJE,
      inicioPontuacao: HOJE,
      pontuacaoInicial: 0,
      telefone: null,
      nivel: 550,
      semNota: true,
    });
    expect(j.periodos).toEqual([expect.objectContaining({ inicio: HOJE, fim: null })]);
  });

  it('GEL-39: telefone com máscara grava só os 11 dígitos', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'Com Fone', telefone: '(11) 98765-4321' });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { telefone: string }).telefone).toBe('11987654321');
  });

  it('GEL-40: pontuação inicial de 9999 é aceita', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'Veterano', pontuacaoInicial: 9999 });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { pontuacaoInicial: number }).pontuacaoInicial).toBe(9999);
  });

  it('GEL-31: data de entrada informada vira o início do período', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'Antigo', dataEntrada: '2024-02-29' });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ desde: '2024-02-29', inicioPontuacao: '2024-02-29' });
  });

  it.each([
    ['GEL-33', 'data de entrada amanhã', { dataEntrada: '2026-06-16' }, 'dataEntrada', MENSAGEM_DATA_FUTURA],
    ['GEL-33', 'data de entrada que não existe', { dataEntrada: '2026-02-30' }, 'dataEntrada', MENSAGEM_DATA_INVALIDA],
    ['SEC-002', 'data de entrada 0000-01-01', { dataEntrada: '0000-01-01' }, 'dataEntrada', MENSAGEM_DATA_ANTES_DO_PISO],
    ['SEC-002', 'data de entrada 1999-12-31', { dataEntrada: '1999-12-31' }, 'dataEntrada', MENSAGEM_DATA_ANTES_DO_PISO],
    ['GEL-34', 'apelido de 1 letra', { apelido: 'A' }, 'apelido', MENSAGEM_APELIDO],
    ['GEL-34', 'apelido de 31 letras', { apelido: 'a'.repeat(31) }, 'apelido', MENSAGEM_APELIDO],
    ['GEL-36', 'ano 1939', { anoNascimento: 1939 }, 'anoNascimento', mensagemAnoNascimento(2016)],
    ['GEL-36', 'ano 2017 (hoje − 9)', { anoNascimento: 2017 }, 'anoNascimento', mensagemAnoNascimento(2016)],
    ['GEL-37', 'posição fora das 7', { posicao: 'defensor' }, 'posicao', MENSAGEM_POSICAO],
    ['GEL-39', 'telefone sem o 9', { telefone: '1187654321' }, 'telefone', MENSAGEM_TELEFONE],
    ['GEL-39', 'telefone com DDD 0', { telefone: '01987654321' }, 'telefone', MENSAGEM_TELEFONE],
    ['GEL-40', 'pontuação negativa', { pontuacaoInicial: -1 }, 'pontuacaoInicial', MENSAGEM_PONTUACAO],
    ['GEL-40', 'pontuação 10000', { pontuacaoInicial: 10000 }, 'pontuacaoInicial', MENSAGEM_PONTUACAO],
    ['GEL-40', 'pontuação fracionária', { pontuacaoInicial: 1.5 }, 'pontuacaoInicial', MENSAGEM_PONTUACAO],
  ] as const)('%s: %s dá 422 com o campo e a mensagem, e nada é gravado', async (_id, _caso, mudanca, campo, mensagem) => {
    const apelido = 'apelido' in mudanca ? mudanca.apelido : 'Inválido';
    const r = await cadastrar({ ...VALIDO, apelido, ...mudanca });
    expect(r.status).toBe(422);
    const erro = (await r.json()) as { codigo: string; campos: string[]; mensagens: Record<string, string> };
    expect(erro.codigo).toBe('dados_invalidos');
    expect(erro.campos).toContain(campo);
    expect(erro.mensagens[campo]).toBe(mensagem);
    expect(await existe(apelido)).toBe(false);
  });

  it('GEL-36: o ano de hoje − 10 (2016) é aceito', async () => {
    expect((await cadastrar({ ...VALIDO, apelido: 'Mirim', anoNascimento: 2016 })).status).toBe(201);
  });

  it('GEL-35: apelido repetido sem caixa dá 422 no apelido', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'toninho' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { mensagens: Record<string, string> }).mensagens.apelido).toBe(MENSAGEM_APELIDO_REPETIDO);
  });

  it('GEL-31: dataEntrada é o único campo de data aceito; campo extra dá 422', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'Extra', inicioPontuacao: '2020-01-01' });
    expect(r.status).toBe(422);
    expect(await existe('Extra')).toBe(false);
  });

  it('GEL-21: B, sem vínculo com G, recebe 404 e nada é gravado', async () => {
    const r = await cadastrar({ ...VALIDO, apelido: 'Intruso' }, aberto.cenario.contaB);
    expect(r.status).toBe(404);
    expect(await existe('Intruso')).toBe(false);
  });
});

describe('GET /api/grupos/:grupoId/jogadores', () => {
  it('GEL-46: a lista tem os campos da spec em cada item', async () => {
    const r = await pedir(`/grupos/${aberto.cenario.grupoG}/jogadores`, aberto.cenario.contaO);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { jogadores: Array<Record<string, unknown>> };
    expect(Object.keys(corpo)).toEqual(['jogadores']);
    expect(corpo.jogadores).toHaveLength(3);
    for (const j of corpo.jogadores) {
      expect(Object.keys(j).sort()).toEqual(['apelido', 'desde', 'id', 'nivel', 'posicao', 'semNota', 'situacao']);
    }
    expect(JSON.stringify(corpo)).not.toContain('telefone');
  });

  it('GEL-21: B recebe 404', async () => {
    const r = await pedir(`/grupos/${aberto.cenario.grupoG}/jogadores`, aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});
