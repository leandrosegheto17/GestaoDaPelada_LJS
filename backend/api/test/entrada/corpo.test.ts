import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { cadastroCorpo, dadosGrupo, MENSAGEM_CORRIJA_CAMPOS, MENSAGEM_HORARIO_INVALIDO, MENSAGEM_NOME_GRUPO } from '@pelada/contrato';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import {
  comUnicidade,
  erroDeUnicidade,
  lerCorpo,
  lerCorpoDoGrupo,
  MENSAGEM_APELIDO_REPETIDO,
  MENSAGEM_HABILIDADE_REPETIDA,
} from '../../src/entrada/corpo.ts';
import { contextoFalso, envCom } from '../db/requisicao.ts';

/**
 * Leitor de corpo, erros e unicidade (T20; GEL-118). Sem banco: as rotas de teste não consultam; o 23505 vem de um
 * dublê com a forma do erro do `pg` (`code` e `constraint`).
 */

let falhaDaEscrita: unknown = null;

function montar() {
  return criarApp({
    registrarExtras: (api: Hono<Ambiente>) => {
      api.post('/teste-corpo-grupo', async (c) => {
        const corpo = await lerCorpoDoGrupo(c, dadosGrupo);
        if (!corpo.ok) return corpo.resposta;
        return c.json(corpo.dados, 200);
      });
      api.post('/teste-corpo-acesso', async (c) => {
        const corpo = await lerCorpo(c, cadastroCorpo);
        if (!corpo.ok) return corpo.resposta;
        return c.json({ ok: true }, 200);
      });
      api.post('/teste-unicidade', (c) =>
        comUnicidade(c, async () => {
          if (falhaDaEscrita) throw falhaDaEscrita;
          return c.json({ gravado: true }, 201);
        }),
      );
    },
  });
}

async function postar(caminho: string, corpo: unknown, cru?: string): Promise<Response> {
  const ctx = contextoFalso();
  const r = await montar().request(
    `/api${caminho}`,
    {
      method: 'POST',
      headers: { 'x-pelada': '1', 'content-type': 'application/json' },
      body: cru ?? JSON.stringify(corpo),
    },
    envCom(''),
    ctx,
  );
  await ctx.esperar();
  return r;
}

const GRUPO = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' };

describe('lerCorpoDoGrupo', () => {
  it('GEL-118: corpo inválido devolve 422 com a mensagem geral e uma mensagem por campo', async () => {
    const r = await postar('/teste-corpo-grupo', { ...GRUPO, nome: 'AB', horario: '7:30' });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      erro: MENSAGEM_CORRIJA_CAMPOS,
      codigo: 'dados_invalidos',
      campos: ['horario', 'nome'],
      mensagens: { horario: MENSAGEM_HORARIO_INVALIDO, nome: MENSAGEM_NOME_GRUPO },
    });
    expect(MENSAGEM_CORRIJA_CAMPOS).toBe('Corrija os campos indicados.');
  });

  it('GEL-118: um campo com dois problemas leva só a primeira mensagem', async () => {
    const r = await postar('/teste-corpo-grupo', { ...GRUPO, horario: '' });
    const corpo = (await r.json()) as { mensagens: Record<string, string> };
    expect(corpo.mensagens).toEqual({ horario: 'Informe o horário.' });
  });

  it('GEL-07: campo a mais (slug) é 422 com a mensagem geral', async () => {
    const r = await postar('/teste-corpo-grupo', { ...GRUPO, slug: 'x' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ erro: MENSAGEM_CORRIJA_CAMPOS, codigo: 'dados_invalidos' });
  });

  it('GEL-118: JSON inválido é 422 no campo corpo', async () => {
    const r = await postar('/teste-corpo-grupo', null, '{nome:');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos', campos: ['corpo'] });
  });

  it('GEL-01: corpo válido chega à rota já normalizado', async () => {
    const r = await postar('/teste-corpo-grupo', { ...GRUPO, nome: '  Pelada  ' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ...GRUPO, nome: 'Pelada' });
  });
});

describe('lerCorpo das rotas de acesso (sem mudança)', () => {
  it('ACE-03: continua com os nomes em campos e a mensagem da conta e acesso', async () => {
    const r = await postar('/teste-corpo-acesso', { nome: 'A', email: 'ana@exemplo.com', senha: 'senha boa 123', termos: true });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ codigo: 'dados_invalidos', campos: ['nome'] });
    expect(corpo['mensagens']).toBeUndefined();
    expect(corpo['erro']).not.toBe(MENSAGEM_CORRIJA_CAMPOS);
  });
});

describe('erroDeUnicidade e comUnicidade', () => {
  it('GEL-35: 23505 em jogadores_apelido_grupo vira 422 no campo apelido', async () => {
    falhaDaEscrita = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'jogadores_apelido_grupo' });
    const r = await postar('/teste-unicidade', {});
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      erro: MENSAGEM_CORRIJA_CAMPOS,
      codigo: 'dados_invalidos',
      campos: ['apelido'],
      mensagens: { apelido: MENSAGEM_APELIDO_REPETIDO },
    });
    expect(MENSAGEM_APELIDO_REPETIDO).toBe('Já existe um jogador com esse apelido neste grupo.');
  });

  it('GEL-91: 23505 em habilidades_nome_grupo vira 422 no campo nome', () => {
    expect(erroDeUnicidade({ code: '23505', constraint: 'habilidades_nome_grupo' })).toEqual({
      campo: 'nome',
      mensagem: MENSAGEM_HABILIDADE_REPETIDA,
    });
    expect(MENSAGEM_HABILIDADE_REPETIDA).toBe('Já existe uma habilidade com esse nome.');
  });

  it('GEL-118: 23505 de outra constraint sobe como 500', async () => {
    falhaDaEscrita = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'contas_email_unico' });
    const r = await postar('/teste-unicidade', {});
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ erro: 'Erro interno.' });
  });

  it('GEL-118: outro código de erro na mesma constraint não é traduzido', () => {
    expect(erroDeUnicidade({ code: '23503', constraint: 'jogadores_apelido_grupo' })).toBeNull();
    expect(erroDeUnicidade(new Error('x'))).toBeNull();
    expect(erroDeUnicidade(null)).toBeNull();
  });

  it('sem erro, a escrita responde como veio', async () => {
    falhaDaEscrita = null;
    const r = await postar('/teste-unicidade', {});
    expect(r.status).toBe(201);
  });
});
