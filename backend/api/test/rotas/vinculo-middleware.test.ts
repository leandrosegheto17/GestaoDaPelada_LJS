import type { Hono } from 'hono';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';
import { GRUPO_A, GRUPO_B } from '../apoio/cenario-dois-grupos.ts';
import { criarSessao } from '../apoio/sessao-worker.ts';

// exigirVinculo em /api/grupos/:grupoId/* (design C3; ACE-41, G-03): sem vínculo com o grupo, 404.

let executadas: string[] = [];

/** Rotas de prova do grupo; registram quando o handler roda e devolvem a conta e o grupo vistos pela rota. */
function rotasDeProva(app: Hono<AppEnv>): void {
  app.get('/api/grupos/:grupoId/prova', async (c) => {
    executadas.push('get');
    const { rows } = await sql<{ conta: string; grupos: string[] }>`
      SELECT current_setting('app.conta_id', true) AS conta, array(SELECT id::text FROM grupos ORDER BY id) AS grupos
    `.execute(c.var.db);
    return c.json({ grupoId: c.req.param('grupoId'), ...rows[0] });
  });
  app.post('/api/grupos/:grupoId/prova', (c) => {
    executadas.push('post');
    return c.json({ ok: true });
  });
  app.delete('/api/grupos/:grupoId/a/b/:id', (c) => {
    executadas.push('delete');
    return c.body(null, 204);
  });
}

const opcoes = { preparar: rotasDeProva };
const escrita = (method: string, cookie: string) => ({ method, headers: { Cookie: cookie, 'X-Pelada': '1' } });

describe('exigirVinculo (ACE-41)', () => {
  it('conta com vínculo no grupo: a rota roda e vê o grupo', async () => {
    executadas = [];
    const s = await criarSessao(GRUPO_A);
    const r = await chamar(`/api/grupos/${GRUPO_A.grupo}/prova`, { headers: { Cookie: s.cookie } }, opcoes);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ grupoId: GRUPO_A.grupo, conta: s.contaId, grupos: [GRUPO_A.grupo] });
    expect(executadas).toEqual(['get']);
  });

  it('conta de outro grupo: 404 no formato padrão e a rota não roda', async () => {
    executadas = [];
    const s = await criarSessao(GRUPO_B);
    const r = await chamar(`/api/grupos/${GRUPO_A.grupo}/prova`, { headers: { Cookie: s.cookie } }, opcoes);
    expect(r.status).toBe(404);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
    expect(executadas).toEqual([]);
  });

  it('conta sem vínculo nenhum: 404, igual ao de um grupo que não existe', async () => {
    const s = await criarSessao();
    const semVinculo = await chamar(`/api/grupos/${GRUPO_A.grupo}/prova`, { headers: { Cookie: s.cookie } }, opcoes);
    const inexistente = await chamar(
      `/api/grupos/${crypto.randomUUID()}/prova`,
      { headers: { Cookie: s.cookie } },
      opcoes,
    );
    expect(semVinculo.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(semVinculo.texto).toBe(inexistente.texto);
  });

  it('escritas e subcaminhos também: POST e DELETE de outro grupo dão 404 sem rodar a rota', async () => {
    executadas = [];
    const s = await criarSessao(GRUPO_B);
    const post = await chamar(`/api/grupos/${GRUPO_A.grupo}/prova`, escrita('POST', s.cookie), opcoes);
    const del = await chamar(
      `/api/grupos/${GRUPO_A.grupo}/a/b/${crypto.randomUUID()}`,
      escrita('DELETE', s.cookie),
      opcoes,
    );
    expect([post.status, del.status]).toEqual([404, 404]);
    expect(executadas).toEqual([]);
  });

  it('grupoId que não é uuid: 404 (não 500)', async () => {
    const s = await criarSessao(GRUPO_A);
    const r = await chamar('/api/grupos/nao-e-uuid/prova', { headers: { Cookie: s.cookie } }, opcoes);
    expect(r.status).toBe(404);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
  });

  it('sem sessão: 401 sessao_expirada antes de olhar o grupo', async () => {
    executadas = [];
    const r = await chamar(`/api/grupos/${GRUPO_A.grupo}/prova`, {}, opcoes);
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
    expect(executadas).toEqual([]);
  });
});
