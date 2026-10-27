import type { SessaoEu } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { destinoAposEntrar, decidirRota } from './decidir-rota';

const sessao: SessaoEu = {
  id: 'c1',
  nome: 'Ana',
  email: 'ana@exemplo.com.br',
  grupos: [{ id: 'g1', nome: 'Quinta', slug: 'quinta', acessaFinanceiro: true }],
};

const em = (pathname: string, search = '') => ({ pathname, search });

describe('decidirRota', () => {
  it('sem sessão em /app/conta vai a /entrar com a volta (ACE-19)', () => {
    expect(decidirRota(null, em('/app/conta'))).toBe('/entrar?volta=%2Fapp%2Fconta');
  });

  it('a volta leva também a consulta da página pedida', () => {
    expect(decidirRota(null, em('/app/grupos/g1/admins', '?x=1'))).toBe(
      '/entrar?volta=%2Fapp%2Fgrupos%2Fg1%2Fadmins%3Fx%3D1',
    );
  });

  it('/app sem sessão também vai a /entrar', () => {
    expect(decidirRota(null, em('/app'))).toBe('/entrar?volta=%2Fapp');
  });

  it.each(['/', '/entrar', '/cadastro', '/termos', '/privacidade', '/confirmar', '/entrar/esqueci', '/aplicativo'])(
    '%s abre sem sessão',
    (rota) => {
      expect(decidirRota(null, em(rota))).toBeNull();
    },
  );

  it('logado em /entrar vai a /app (ACE-65)', () => {
    expect(decidirRota(sessao, em('/entrar'))).toBe('/app');
  });

  it('logado em /entrar com volta válida vai à volta', () => {
    expect(decidirRota(sessao, em('/entrar', '?volta=%2Fapp%2Fconta'))).toBe('/app/conta');
  });

  it('logado em /entrar com volta perigosa vai a /app', () => {
    expect(decidirRota(sessao, em('/entrar', '?volta=%2F%2Fevil.com'))).toBe('/app');
  });

  it.each(['/app', '/app/conta', '/termos', '/entrar/esqueci', '/entrar/nova-senha'])(
    'logado, %s abre sem redirecionar',
    (rota) => {
      expect(decidirRota(sessao, em(rota))).toBeNull();
    },
  );
});

describe('destinoAposEntrar', () => {
  it('depois do login volta à página pedida (ACE-19)', () => {
    expect(destinoAposEntrar('/app/conta')).toBe('/app/conta');
  });

  it.each([null, undefined, '', '//evil.com', '/\\evil.com', 'https://evil.com', '/%2F%2Fevil.com', '/a\r\nb'])(
    'volta %j cai em /app',
    (volta) => {
      expect(destinoAposEntrar(volta)).toBe('/app');
    },
  );
});
