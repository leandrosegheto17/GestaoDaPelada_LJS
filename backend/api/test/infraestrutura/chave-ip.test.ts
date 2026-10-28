// Critério: ACE-71 (IPv6 pelo prefixo /64; IPv4 inteiro; ausência de IP segue em `sem-ip`).
import { describe, expect, it } from 'vitest';
import { chaveDoIp } from '../../src/infraestrutura/sessao/chave-ip.ts';

describe('chaveDoIp (ACE-71)', () => {
  it('IPv4 não muda', () => {
    expect(chaveDoIp('203.0.113.7')).toBe('203.0.113.7');
    expect(chaveDoIp('203.0.113.8')).not.toBe(chaveDoIp('203.0.113.7'));
  });

  it('ausência de IP dá sem-ip', () => {
    expect(chaveDoIp(undefined)).toBe('sem-ip');
    expect(chaveDoIp(null)).toBe('sem-ip');
    expect(chaveDoIp('')).toBe('sem-ip');
  });

  it('dois endereços do mesmo /64 dão a mesma chave', () => {
    expect(chaveDoIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(chaveDoIp('2001:db8:1:2:1:2:3:4'));
  });

  it('/64 diferentes dão chaves diferentes', () => {
    expect(chaveDoIp('2001:db8:1:2::1')).not.toBe(chaveDoIp('2001:db8:1:3::1'));
    expect(chaveDoIp('2001:db8:1:2::1')).not.toBe(chaveDoIp('2001:db8:9:2::1'));
  });

  it('forma compactada, zeros à esquerda e caixa não mudam a chave', () => {
    const base = chaveDoIp('2001:db8:0:0:1:2:3:4');
    expect(chaveDoIp('2001:db8::1:2:3:4')).toBe(base);
    expect(chaveDoIp('2001:0db8:0000:0000:0001:0002:0003:0004')).toBe(base);
    expect(chaveDoIp('2001:DB8::1:2:3:4')).toBe(base);
    expect(chaveDoIp('2001:db8::')).toBe(base);
    expect(chaveDoIp('::1')).toBe(chaveDoIp('0:0:0:0:ffff:ffff:ffff:ffff'));
  });

  it(':: no começo e no meio expandem para o número certo de grupos', () => {
    expect(chaveDoIp('::1')).not.toBe(chaveDoIp('1::1'));
    expect(chaveDoIp('1::1')).toBe(chaveDoIp('1:0:0:0:5:6:7:8'));
    expect(chaveDoIp('1:2:3:4::')).toBe(chaveDoIp('1:2:3:4:9:9:9:9'));
  });

  it('IPv4 mapeado em IPv6 vale como o IPv4', () => {
    expect(chaveDoIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(chaveDoIp('::FFFF:203.0.113.7')).toBe('203.0.113.7');
  });

  it('a chave de IPv6 não se confunde com um IPv4', () => {
    expect(chaveDoIp('2001:db8::1')).toContain(':');
  });
});
