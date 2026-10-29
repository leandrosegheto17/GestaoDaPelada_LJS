import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import { criarRelogio, relogioFixo } from '../../src/infraestrutura/relogio/index.ts';
import { chamar } from '../apoio/cliente.ts';

// Relógio no contexto do Hono (T22; AD-015): as rotas leem a data só por c.get('relogio').

function rotaDoRelogio(app: Hono<AppEnv>): void {
  app.get('/api/teste/hoje', (c) => {
    const relogio = c.get('relogio');
    return c.json({ hoje: relogio.hoje(), mes: relogio.mes(), agora: relogio.agoraIso() });
  });
}

describe('relógio no contexto (AD-015)', () => {
  it('com criarApp({ relogio }), a rota lê a data fixa, inclusive às 22h de São Paulo', async () => {
    const r = await chamar(
      '/api/teste/hoje',
      {},
      { preparar: rotaDoRelogio, app: { relogio: relogioFixo('2026-12-31', '22:00') } },
    );
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ hoje: '2026-12-31', mes: '2026-12', agora: '2027-01-01T01:00:00.000Z' });
  });

  it('sem a opção, usa o relógio real (AAAA-MM-DD)', async () => {
    const r = await chamar('/api/teste/hoje', {}, { preparar: rotaDoRelogio });
    expect(r.status).toBe(200);
    const corpo = r.corpo as { hoje: string; agora: string };
    expect(corpo.hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // O instante real está a poucos segundos de agora.
    expect(Math.abs(Date.parse(corpo.agora) - Date.parse(criarRelogio().agoraIso()))).toBeLessThan(60_000);
  });
});
