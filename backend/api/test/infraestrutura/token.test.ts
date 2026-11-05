import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chaveIp,
  gerarToken,
  hashIp,
  hashToken,
  SEM_IP,
} from '../../src/infraestrutura/sessao/token.ts';

/** Token, hash e chave de IP (T13; ACE-10, ACE-71, ACE-73). */

describe('gerarToken e hashToken', () => {
  it('ACE-10: o token tem 43 caracteres base64url e o hash tem 32 bytes', async () => {
    const t = await gerarToken();
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.hash).toBeInstanceOf(Uint8Array);
    expect(t.hash.length).toBe(32);
  });

  it('ACE-10: o hash é o SHA-256 do token e não contém o token', async () => {
    const t = await gerarToken();
    const esperado = createHash('sha256').update(t.token).digest();
    expect(Buffer.from(t.hash).equals(esperado)).toBe(true);
    expect(Buffer.from(t.hash).toString('latin1')).not.toContain(t.token);
    expect(Buffer.from(t.hash).toString('base64url')).not.toBe(t.token);
  });

  it('ACE-10: dois tokens seguidos diferem', async () => {
    const [a, b] = await Promise.all([gerarToken(), gerarToken()]);
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.hash).equals(Buffer.from(b.hash))).toBe(false);
  });

  it('ACE-10: hashToken é determinístico', async () => {
    const t = await gerarToken();
    expect(Buffer.from(await hashToken(t.token)).equals(Buffer.from(t.hash))).toBe(true);
  });
});

describe('chaveIp', () => {
  it('ACE-71: IPv4 entra inteiro', () => {
    expect(chaveIp('203.0.113.10')).toBe('203.0.113.10');
    expect(chaveIp('203.0.113.11')).not.toBe(chaveIp('203.0.113.10'));
  });

  it('ACE-71: dois IPv6 do mesmo /64 dão a mesma chave', () => {
    expect(chaveIp('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(chaveIp('2001:db8:1:2:bbbb::9')).toBe('2001:db8:1:2::/64');
  });

  it('ACE-71: IPv6 de /64 diferentes dão chaves diferentes', () => {
    expect(chaveIp('2001:db8:1:3::1')).not.toBe(chaveIp('2001:db8:1:2::1'));
  });

  it('ACE-71: IPv6 abreviado, por extenso, com zeros à esquerda e em maiúsculas dão a mesma chave', () => {
    const chave = chaveIp('2001:db8:1:2::1');
    expect(chaveIp('2001:0db8:0001:0002:0000:0000:0000:0001')).toBe(chave);
    expect(chaveIp('2001:DB8:1:2::1')).toBe(chave);
    expect(chaveIp('[2001:db8:1:2::1]')).toBe(chave);
    expect(chaveIp('2001:db8:1:2::1%eth0')).toBe(chave);
  });

  it('ACE-71: IPv4 mapeado em IPv6 (::ffff:) vale como o IPv4', () => {
    expect(chaveIp('::ffff:203.0.113.10')).toBe('203.0.113.10');
    expect(chaveIp('::FFFF:cb00:710a')).toBe('203.0.113.10');
  });

  it('ACE-71: IPv6 com zeros no começo (::1) usa o /64 de zeros', () => {
    expect(chaveIp('::1')).toBe('0:0:0:0::/64');
  });

  it.each([null, undefined, '', '   ', 'não é ip', '999.1.1.1', '1:2:3', '1::2::3', 'gggg::1'])(
    'ACE-71: sem IP ou valor inválido (%s) dá sem-ip',
    (v) => {
      expect(chaveIp(v as string | null | undefined)).toBe(SEM_IP);
    },
  );

  it('ACE-73: no prefixo 48, 2001:db8:1:2::1 e 2001:db8:1:ff::1 dão a mesma chave', () => {
    expect(chaveIp('2001:db8:1:2::1', 48)).toBe('2001:db8:1::/48');
    expect(chaveIp('2001:db8:1:ff::1', 48)).toBe('2001:db8:1::/48');
    expect(chaveIp('2001:db8:2:2::1', 48)).not.toBe(chaveIp('2001:db8:1:2::1', 48));
  });

  it('ACE-73: no prefixo 48, IPv4 continua inteiro', () => {
    expect(chaveIp('198.51.100.20', 48)).toBe('198.51.100.20');
  });

  it('ACE-71: hashIp é o SHA-256 da chave, igual para o mesmo /64', async () => {
    const a = await hashIp('2001:db8:1:2:aaaa::1');
    const b = await hashIp('2001:db8:1:2:bbbb::9');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(createHash('sha256').update('2001:db8:1:2::/64').digest())).toBe(
      true,
    );
  });
});
