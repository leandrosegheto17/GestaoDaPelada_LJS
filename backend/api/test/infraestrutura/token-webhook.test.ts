import { describe, expect, it } from 'vitest';
import {
  tokenDoWebhookConfere,
  tokenDoWebhookValido,
} from '../../src/infraestrutura/asaas/token-webhook.ts';

/** Token do webhook do Asaas (PLA-38, PLA-39; A-11): 32 a 255 caracteres e diferente da chave da API. */

const TOKEN = 'a'.repeat(32);
const CHAVE = 'b'.repeat(40);

describe('tokenDoWebhookValido', () => {
  it('PLA-38: 31 caracteres não servem; 32 e 255 servem; 256 não serve', () => {
    expect(tokenDoWebhookValido('a'.repeat(31), CHAVE)).toBe(false);
    expect(tokenDoWebhookValido('a'.repeat(32), CHAVE)).toBe(true);
    expect(tokenDoWebhookValido('a'.repeat(255), CHAVE)).toBe(true);
    expect(tokenDoWebhookValido('a'.repeat(256), CHAVE)).toBe(false);
  });

  it('PLA-38: ausente e vazio não servem', () => {
    expect(tokenDoWebhookValido(undefined, CHAVE)).toBe(false);
    expect(tokenDoWebhookValido('', CHAVE)).toBe(false);
  });

  it('PLA-38: token igual à chave da API não serve', () => {
    expect(tokenDoWebhookValido(CHAVE, CHAVE)).toBe(false);
  });
});

describe('tokenDoWebhookConfere', () => {
  it('PLA-39: token certo e válido confere', async () => {
    expect(await tokenDoWebhookConfere(TOKEN, TOKEN, CHAVE)).toBe(true);
  });

  it('PLA-39: token fraco configurado (31 caracteres) recusa até o valor idêntico', async () => {
    const fraco = 'a'.repeat(31);
    expect(await tokenDoWebhookConfere(fraco, fraco, CHAVE)).toBe(false);
  });

  it('PLA-38: token configurado igual à chave da API recusa até o valor idêntico', async () => {
    expect(await tokenDoWebhookConfere(CHAVE, CHAVE, CHAVE)).toBe(false);
  });

  it('PLA-39: valor diferente ou ausente não confere', async () => {
    expect(await tokenDoWebhookConfere(`${TOKEN}x`, TOKEN, CHAVE)).toBe(false);
    expect(await tokenDoWebhookConfere(undefined, TOKEN, CHAVE)).toBe(false);
  });
});
