import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { caixaDev, remetenteDoAmbiente } from '../../src/infraestrutura/email/caixa-dev.ts';

/** Caixa de e-mails de desenvolvimento (T17; ACE-52). */

const BASE = 'https://exemplo.test';
const permite = { limit: async () => ({ success: true }) };

function env(extra: Partial<Env> = {}): Env {
  return {
    VERSAO: 'v',
    URL_PUBLICA: BASE,
    HYPERDRIVE: { connectionString: '' },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: permite,
    ...extra,
  } as unknown as Env;
}

const MENSAGEM = {
  tipo: 'confirmacao' as const,
  para: 'ana@exemplo.test',
  assunto: 'Confirme o seu e-mail',
  texto: 'link',
  html: '<p>link</p>',
  idempotencia: 'x',
};

afterEach(() => {
  caixaDev.limpar();
});

describe('GET /api/dev/emails', () => {
  it('ACE-52: sem EMAIL_DEV, responde 404 igual a uma rota que não existe', async () => {
    const app = criarApp();
    const r = await app.request(`${BASE}/api/dev/emails`, {}, env());
    const naoExiste = await app.request(`${BASE}/api/nao-existe`, {}, env());
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(await naoExiste.json());
  });

  it('ACE-52: com EMAIL_DEV diferente de 1 (ex.: "true"), continua 404', async () => {
    const r = await criarApp().request(`${BASE}/api/dev/emails`, {}, env({ EMAIL_DEV: 'true' }));
    expect(r.status).toBe(404);
  });

  it('ACE-52: com EMAIL_DEV=1, lista as mensagens da caixa em ordem', async () => {
    await caixaDev.enviar(MENSAGEM);
    await caixaDev.enviar({ ...MENSAGEM, tipo: 'recuperacao', assunto: 'Crie uma nova senha' });
    const r = await criarApp().request(`${BASE}/api/dev/emails`, {}, env({ EMAIL_DEV: '1' }));
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { mensagens: Array<{ tipo: string; para: string }> };
    expect(corpo.mensagens.map((m) => m.tipo)).toEqual(['confirmacao', 'recuperacao']);
    expect(corpo.mensagens[0]?.para).toBe('ana@exemplo.test');
  });

  it('ACE-52: com EMAIL_DEV=1 o remetente é a caixa; sem ela, não', () => {
    expect(remetenteDoAmbiente({ EMAIL_DEV: '1' })).toBe(caixaDev);
    expect(remetenteDoAmbiente({})).not.toBe(caixaDev);
  });
});
