import type { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import { LIMITE_CORPO_BYTES } from '../../src/entrada/app.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';

/** Rotas que só existem no teste, montadas depois dos middlewares do app. */
function rotasDeTeste(app: Hono<AppEnv>): void {
  app.post('/api/teste/escrita', (c) => c.json({ ok: true }));
  app.put('/api/teste/escrita', (c) => c.json({ ok: true }));
  app.patch('/api/teste/escrita', (c) => c.json({ ok: true }));
  app.delete('/api/teste/escrita', (c) => c.json({ ok: true }));
  app.get('/api/teste/erro', () => {
    throw new Error('segredo-interno');
  });
}

const comRotas = { preparar: rotasDeTeste };

describe('middlewares de /api/* (FUN-21)', () => {
  describe('Cache-Control: no-store e nosniff em toda resposta', () => {
    const esgotado = { limit: async () => ({ success: false }) };
    it.each([
      ['200 (health)', '/api/health', {}, {}, 200],
      ['404 (inexistente)', '/api/inexistente', {}, {}, 404],
      ['500 (erro)', '/api/teste/erro', {}, {}, 500],
      ['403 (sem X-Pelada)', '/api/teste/escrita', { method: 'POST' }, {}, 403],
      ['429 (limite)', '/api/publico/x', {}, { limitadores: { publico: esgotado } }, 429],
    ] as const)('%s', async (_nome, caminho, init, app, status) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const r = await chamar(caminho, { ...init }, { ...comRotas, app: { ...app } });
      vi.restoreAllMocks();
      expect(r.status).toBe(status);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('413 (corpo grande) também', async () => {
      const grande = 'x'.repeat(LIMITE_CORPO_BYTES + 1);
      const r = await chamar(
        '/api/teste/escrita',
        { method: 'POST', headers: { 'X-Pelada': '1' }, body: grande },
        comRotas,
      );
      expect(r.status).toBe(413);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  it('rota inexistente responde 404 no formato padrão', async () => {
    const r = await chamar('/api/inexistente');
    expect(r.status).toBe(404);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
  });

  it('erro lançado vira 500 genérico, sem a mensagem na resposta nem no log', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await chamar('/api/teste/erro', {}, comRotas);
    const log = JSON.stringify(espiao.mock.calls);
    espiao.mockRestore();
    expect(r.status).toBe(500);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'erro_interno' } });
    expect(r.texto).not.toContain('segredo-interno');
    expect(log).not.toContain('segredo-interno');
  });

  describe('X-Pelada: 1 em toda escrita (defesa contra CSRF)', () => {
    it.each([
      [{}, 403],
      [{ 'X-Pelada': '0' }, 403],
      [{ 'X-Pelada': 'true' }, 403],
      [{ 'X-Pelada': '11' }, 403],
      [{ 'X-Pelada': '1' }, 200],
      [{ 'x-pelada': '1' }, 200],
    ])('POST com cabeçalhos %j → %i', async (headers, esperado) => {
      const r = await chamar('/api/teste/escrita', { method: 'POST', headers }, comRotas);
      expect(r.status).toBe(esperado);
      if (esperado === 403) {
        expect(ehErroPadrao(r.corpo)).toBe(true);
        expect(r.corpo).toMatchObject({ erro: { codigo: 'requisicao_recusada' } });
      }
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('%s sem o cabeçalho → 403', async (method) => {
      expect((await chamar('/api/teste/escrita', { method }, comRotas)).status).toBe(403);
      expect((await chamar('/api/teste/escrita', { method, headers: { 'X-Pelada': '1' } }, comRotas)).status).toBe(200);
    });

    it('GET não exige o cabeçalho', async () => {
      expect((await chamar('/api/health')).status).toBe(200);
    });
  });

  describe('bodyLimit de 16 KB', () => {
    it('corpo no limite passa', async () => {
      const r = await chamar(
        '/api/teste/escrita',
        { method: 'POST', headers: { 'X-Pelada': '1' }, body: 'x'.repeat(LIMITE_CORPO_BYTES) },
        comRotas,
      );
      expect(LIMITE_CORPO_BYTES).toBe(16 * 1024);
      expect(r.status).toBe(200);
    });

    it('um byte acima responde 413 no formato padrão', async () => {
      const r = await chamar(
        '/api/teste/escrita',
        { method: 'POST', headers: { 'X-Pelada': '1' }, body: 'x'.repeat(LIMITE_CORPO_BYTES + 1) },
        comRotas,
      );
      expect(r.status).toBe(413);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'corpo_grande' } });
    });
  });
});
