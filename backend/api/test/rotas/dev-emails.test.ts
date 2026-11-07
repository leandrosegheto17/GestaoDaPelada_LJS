import { afterEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { caixaDev, remetenteDoAmbiente } from '../../src/infraestrutura/email/caixa-dev.ts';

/** Caixa de e-mails de desenvolvimento (T17; ACE-52). */

const BASE = 'https://exemplo.test';
const permite = { limit: async () => ({ success: true }) };
/** Segredo por execução da caixa (A-12/SEC-04r, AD-135): o `pnpm dev` e o e2e geram um e mandam no cabeçalho. */
const TOKEN = 'token-da-caixa-com-pelo-menos-32-caracteres-x';
const CABECALHO = { 'X-Dev-Token': TOKEN };

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
    const r = await criarApp().request(
      `${BASE}/api/dev/emails`,
      { headers: CABECALHO },
      env({ EMAIL_DEV: '1', DEV_EMAILS_TOKEN: TOKEN }),
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { mensagens: Array<{ tipo: string; para: string }> };
    expect(corpo.mensagens.map((m) => m.tipo)).toEqual(['confirmacao', 'recuperacao']);
    expect(corpo.mensagens[0]?.para).toBe('ana@exemplo.test');
  });

  it('SEC-04r: com EMAIL_DEV=1 mas sem o cabeçalho, com token errado ou vazio, responde o 404 de rota inexistente', async () => {
    await caixaDev.enviar(MENSAGEM);
    const app = criarApp();
    const e = env({ EMAIL_DEV: '1', DEV_EMAILS_TOKEN: TOKEN });
    const corpoNaoExiste = await (await app.request(`${BASE}/api/nao-existe`, {}, e)).json();
    for (const headers of [
      {},
      { 'X-Dev-Token': 'errado' },
      { 'X-Dev-Token': '' },
      { 'X-Dev-Token': `${TOKEN}x` },
      { 'x-dev-token': TOKEN.toUpperCase() },
    ]) {
      const r = await app.request(`${BASE}/api/dev/emails`, { headers }, e);
      expect(r.status, JSON.stringify(headers)).toBe(404);
      expect(await r.json()).toEqual(corpoNaoExiste);
    }
  });

  it('SEC-04r: com EMAIL_DEV=1 e sem DEV_EMAILS_TOKEN no ambiente, a caixa não abre nem com cabeçalho vazio', async () => {
    await caixaDev.enviar(MENSAGEM);
    for (const headers of [{}, { 'X-Dev-Token': '' }, { 'X-Dev-Token': 'undefined' }]) {
      const r = await criarApp().request(
        `${BASE}/api/dev/emails`,
        { headers },
        env({ EMAIL_DEV: '1' }),
      );
      expect(r.status, JSON.stringify(headers)).toBe(404);
    }
  });

  it('ACE-52: com EMAIL_DEV=1 o remetente é a caixa; sem ela, não', () => {
    expect(remetenteDoAmbiente({ EMAIL_DEV: '1' })).toBe(caixaDev);
    expect(remetenteDoAmbiente({})).not.toBe(caixaDev);
  });
});
