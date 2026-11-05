import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LIMITE_CORPO_EVENTO_BYTES } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { MENSAGEM_CORPO_GRANDE } from '../../src/entrada/rotas/publico.ts';
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
 * `POST /api/publico/:slug/eventos` (partidas-e-ranking T47; PAR-127, PAR-128, PAR-129), com o app real como
 * `pelada_app` e o relógio fixo em 14/03/2026 15:00Z. O `afterEach` apaga os eventos de uso que os testes gravaram em G
 * (os do cenário têm `tipo` `partida_lancada`).
 */

let aberto: CenarioGruposAberto;

const AGORA = '2026-03-14T15:00:00.000Z';
const IP = '198.51.100.77';
const USER_AGENT = 'Navegador-de-Teste/1.0';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function enviar(
  slug: string,
  corpo: unknown,
  opcoes: { conta?: string } = {},
): Promise<Response> {
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    'content-length': String(new TextEncoder().encode(texto).length),
    'cf-connecting-ip': IP,
    'user-agent': USER_AGENT,
  });
  if (opcoes.conta) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${await sessao(opcoes.conta)}`);
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${slug}/eventos`,
    { method: 'POST', headers, body: texto },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function eventosPublicos(): Promise<Array<Record<string, unknown>>> {
  const r = await aberto.db.query<Record<string, unknown>>(
    `SELECT * FROM eventos_uso WHERE grupo_id = $1 AND tipo IN ('ranking_aberto', 'pdf_exportado') ORDER BY id`,
    [aberto.cenario.grupoG],
  );
  return r.rows;
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
  await aberto.db.query(
    `DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo IN ('ranking_aberto', 'pdf_exportado')`,
    [aberto.cenario.grupoG],
  );
});

describe('POST /api/publico/:slug/eventos', () => {
  it('PAR-127: ranking_aberto válido responde 204 e grava o momento do relógio fixo', async () => {
    const dispositivoId = crypto.randomUUID();
    const r = await enviar(aberto.cenario.slugG, { tipo: 'ranking_aberto', dispositivoId });
    expect(r.status).toBe(204);
    const linhas = await aberto.db.query<{ tipo: string; dispositivo_id: string; igual: boolean }>(
      `SELECT tipo, dispositivo_id, momento = $2::timestamptz AS igual FROM eventos_uso
        WHERE grupo_id = $1 AND tipo = 'ranking_aberto'`,
      [aberto.cenario.grupoG, AGORA],
    );
    expect(linhas.rows).toEqual([
      { tipo: 'ranking_aberto', dispositivo_id: dispositivoId, igual: true },
    ]);
  });

  it('PAR-127: pdf_exportado válido responde 204 e grava o mês exportado', async () => {
    const r = await enviar(aberto.cenario.slugG, { tipo: 'pdf_exportado', mes: '2026-02' });
    expect(r.status).toBe(204);
    expect((await eventosPublicos()).map((e) => [e['tipo'], e['mes_exportado']])).toEqual([
      ['pdf_exportado', '2026-02'],
    ]);
  });

  it('PAR-129: a linha gravada não tem IP, user-agent nem conta, com cf-connecting-ip e cookie de sessão na requisição', async () => {
    const r = await enviar(
      aberto.cenario.slugG,
      { tipo: 'ranking_aberto', dispositivoId: crypto.randomUUID() },
      {
        conta: aberto.cenario.contaC,
      },
    );
    expect(r.status).toBe(204);
    const [linha] = await eventosPublicos();
    expect(Object.keys(linha ?? {}).sort()).toEqual(
      [
        'data_partida',
        'dispositivo_id',
        'grupo_id',
        'id',
        'mes_exportado',
        'momento',
        'tipo',
      ].sort(),
    );
    const texto = JSON.stringify(linha);
    expect(texto).not.toContain(IP);
    expect(texto).not.toContain(USER_AGENT);
    expect(texto).not.toContain(aberto.cenario.contaC);
  });
});

describe('POST /api/publico/:slug/eventos: recusas', () => {
  it('PAR-128: corpo de 1025 bytes responde 413 sem gravar', async () => {
    const base = JSON.stringify({ tipo: 'pdf_exportado', mes: '2026-02', x: '' });
    const corpo = base.replace(
      '"x":""',
      `"x":"${'a'.repeat(LIMITE_CORPO_EVENTO_BYTES + 1 - base.length)}"`,
    );
    expect(new TextEncoder().encode(corpo).length).toBe(LIMITE_CORPO_EVENTO_BYTES + 1);
    const r = await enviar(aberto.cenario.slugG, corpo);
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ erro: MENSAGEM_CORPO_GRANDE });
    expect(MENSAGEM_CORPO_GRANDE).toBe('O corpo da requisição é grande demais.');
    expect(await eventosPublicos()).toEqual([]);
  });

  it('PAR-128: corpo de exatamente 1024 bytes não é recusado pelo tamanho', async () => {
    const base = JSON.stringify({ tipo: 'pdf_exportado', mes: '2026-02', x: '' });
    const corpo = base.replace(
      '"x":""',
      `"x":"${'a'.repeat(LIMITE_CORPO_EVENTO_BYTES - base.length)}"`,
    );
    expect(new TextEncoder().encode(corpo).length).toBe(LIMITE_CORPO_EVENTO_BYTES);
    const r = await enviar(aberto.cenario.slugG, corpo);
    // O campo `x` a mais é recusado pelo contrato (422), não pelo tamanho (413).
    expect(r.status).toBe(422);
  });

  it.each([
    ['tipo desconhecido', { tipo: 'partida_lancada', data: '2026-03-12' }],
    ['campo a mais', { tipo: 'ranking_aberto', dispositivoId: crypto.randomUUID(), ip: '1.2.3.4' }],
    [
      'aparelho que não é UUID v4',
      { tipo: 'ranking_aberto', dispositivoId: '00000000-0000-1000-8000-000000000000' },
    ],
    ['mês fora do formato', { tipo: 'pdf_exportado', mes: '2026-2' }],
  ])('PAR-128: %s responde 422 sem gravar', async (_nome, corpo) => {
    const r = await enviar(aberto.cenario.slugG, corpo);
    expect(r.status).toBe(422);
    expect(await eventosPublicos()).toEqual([]);
  });

  it('PAR-128: slug de grupo arquivado responde 404 com o corpo do slug inexistente, sem gravar', async () => {
    const corpo = { tipo: 'ranking_aberto', dispositivoId: crypto.randomUUID() };
    const inexistente = await enviar('grupo-que-nao-existe', corpo);
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const arquivado = await enviar(aberto.cenario.slugG, corpo);
    expect(arquivado.status).toBe(404);
    expect({ status: arquivado.status, corpo: await arquivado.json() }).toEqual({
      status: inexistente.status,
      corpo: await inexistente.json(),
    });
    expect(await eventosPublicos()).toEqual([]);
  });
});
