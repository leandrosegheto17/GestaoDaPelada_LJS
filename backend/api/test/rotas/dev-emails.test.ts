import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { remetenteMemoria } from '../../src/infraestrutura/email/memoria.ts';
import { REMETENTE_QUE_FALHA, SENHA } from '../apoio/acesso.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';

// Caixa de e-mails de desenvolvimento (design C5; ACE-52): só com EMAIL_DEV=1.

const comEmailDev = { ...env, EMAIL_DEV: '1' };
const cadastro = (email: string) => ({
  method: 'POST',
  headers: { 'X-Pelada': '1', 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome: 'Pessoa Dev', email, senha: SENHA, termos: true }),
});

describe('GET /api/dev/emails', () => {
  it('sem EMAIL_DEV: 404 no formato padrão, mesmo com remetente em memória', async () => {
    const r = await chamar('/api/dev/emails', {}, { app: { remetente: remetenteMemoria() } });
    expect(r.status).toBe(404);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
  });

  it('com EMAIL_DEV=1 e o remetente do ambiente (caixa em memória): lista os e-mails enviados', async () => {
    const email = `dev-${crypto.randomUUID()}@exemplo.com`;
    const feito = await chamar('/api/conta', cadastro(email), { env: comEmailDev });
    expect(feito.status).toBe(201);

    const r = await chamar('/api/dev/emails', {}, { env: comEmailDev });
    expect(r.status).toBe(200);
    const mensagens = (r.corpo as { mensagens: { para: string; assunto: string; texto: string }[] }).mensagens;
    const minha = mensagens.find((m) => m.para === email);
    expect(minha?.assunto).toBe('Confirme seu e-mail');
    expect(minha?.texto).toMatch(/#t=[A-Za-z0-9_-]{43}/);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('com EMAIL_DEV=1 e um remetente que não é a caixa: 404 (nada para listar)', async () => {
    const r = await chamar('/api/dev/emails', {}, { env: comEmailDev, app: { remetente: REMETENTE_QUE_FALHA } });
    expect(r.status).toBe(404);
  });

  it('EMAIL_DEV diferente de 1: 404', async () => {
    const r = await chamar('/api/dev/emails', {}, { env: { ...env, EMAIL_DEV: 'true' } });
    expect(r.status).toBe(404);
  });
});
