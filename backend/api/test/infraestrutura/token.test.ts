// Critérios: ACE-10 (o banco guarda só o hash) e AD-010 (token de 32 bytes em base64url, hash SHA-256).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gerarToken, hashIp } from '../../src/infraestrutura/sessao/token.ts';

describe('gerarToken', () => {
  it('gera tokens diferentes em chamadas seguidas', async () => {
    const [a, b] = [await gerarToken(), await gerarToken()];
    expect(a.token).not.toBe(b.token);
  });
  it('o token tem 32 bytes em base64url (43 caracteres, sem preenchimento)', async () => {
    const { token } = await gerarToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });
  it('o hash tem 32 bytes e é o SHA-256 do token', async () => {
    const { token, hash } = await gerarToken();
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash).toHaveLength(32);
    expect(Buffer.from(hash).toString('hex')).toBe(createHash('sha256').update(token).digest('hex'));
  });
});

describe('hashIp', () => {
  it('é o SHA-256 do IP, em 32 bytes', async () => {
    const hash = await hashIp('203.0.113.7');
    expect(hash).toHaveLength(32);
    expect(Buffer.from(hash).toString('hex')).toBe(createHash('sha256').update('203.0.113.7').digest('hex'));
  });
  it('IPs diferentes dão hashes diferentes', async () => {
    expect(Buffer.from(await hashIp('203.0.113.7'))).not.toEqual(Buffer.from(await hashIp('203.0.113.8')));
  });
});
