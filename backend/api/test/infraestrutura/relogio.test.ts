import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { dataEmSaoPaulo, relogioDoSistema, relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { contextoFalso, envCom } from '../db/requisicao.ts';

/** Relógio da API (T19; GEL-32, GEL-52, GEL-55). Sem banco: a rota de teste não consulta. */

describe('dataEmSaoPaulo', () => {
  it('GEL-32: às 22h de São Paulo (01h UTC do dia seguinte), hoje é a data de São Paulo', () => {
    expect(dataEmSaoPaulo(new Date('2026-11-06T01:00:00Z'))).toBe('2026-11-05');
    expect(relogioFixo('2026-11-06T01:00:00Z').hoje()).toBe('2026-11-05');
  });

  it('GEL-32: a virada do dia é a meia-noite de São Paulo (03h UTC)', () => {
    expect(dataEmSaoPaulo(new Date('2026-11-06T02:59:59Z'))).toBe('2026-11-05');
    expect(dataEmSaoPaulo(new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-06');
  });

  it('GEL-32: virada do ano em São Paulo', () => {
    expect(dataEmSaoPaulo(new Date('2027-01-01T02:30:00Z'))).toBe('2026-12-31');
  });

  it('agoraIso devolve o instante em UTC', () => {
    expect(relogioFixo('2026-11-06T01:00:00Z').agoraIso()).toBe('2026-11-06T01:00:00.000Z');
  });

  it('relogioFixo recusa instante inválido', () => {
    expect(() => relogioFixo('ontem')).toThrow();
  });

  it('relogioDoSistema devolve uma data AAAA-MM-DD', () => {
    expect(relogioDoSistema().hoje()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('criarApp({ relogio })', () => {
  function pedir(app: ReturnType<typeof criarApp>) {
    const ctx = contextoFalso();
    return app.request('/api/teste-relogio', { headers: { 'x-pelada': '1' } }, envCom(''), ctx);
  }

  const extras = (api: Hono<Ambiente>) => {
    api.get('/teste-relogio', (c) =>
      c.json({ hoje: c.var.relogio.hoje(), agora: c.var.relogio.agoraIso() }),
    );
  };

  it('GEL-32: as rotas usam o relógio falso', async () => {
    const app = criarApp({ relogio: relogioFixo('2026-11-06T01:00:00Z'), registrarExtras: extras });
    const r = await pedir(app);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hoje: '2026-11-05', agora: '2026-11-06T01:00:00.000Z' });
  });

  it('sem relógio, o app usa o do sistema', async () => {
    const app = criarApp({ registrarExtras: extras });
    const r = await pedir(app);
    const corpo = (await r.json()) as { hoje: string };
    expect(corpo.hoje).toBe(relogioDoSistema().hoje());
  });
});
