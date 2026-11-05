import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Landing, TEXTO_PROPOSTA } from '../../src/telas/landing/Landing.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

/** Landing (planos-e-cobranca T52; PLA-61, PLA-62, PLA-63). A prova de "lado a lado" é do e2e (T55). */

afterEach(() => {
  cleanup();
});

function montar(caminho = '/') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Landing />
    </MemoryRouter>,
  );
}

describe('Landing', () => {
  it('PLA-61: mostra o nome do produto e o que ele resolve', () => {
    montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeDefined();
    expect(screen.getByText(TEXTO_PROPOSTA)).toBeDefined();
  });

  it('PLA-61: os dois botões levam a /cadastro e /entrar', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Criar conta' }).getAttribute('href')).toBe(
      '/cadastro',
    );
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/entrar');
  });

  it('PLA-61: o plano Free é "Grátis", com partidas, ranking, 20 jogadores e 1 grupo', () => {
    montar();
    const free = screen.getByRole('region', { name: 'Free' });
    expect(within(free).getByText('Grátis')).toBeDefined();
    expect(within(free).getByText('Partidas com presença')).toBeDefined();
    expect(within(free).getByText('Ranking, inclusive o link público')).toBeDefined();
    expect(within(free).getByText('Até 20 jogadores ativos')).toBeDefined();
    expect(within(free).getByText('1 grupo')).toBeDefined();
    expect(within(free).queryByText('Simulador de times')).toBeNull();
  });

  it('PLA-61, PLA-62: o plano Pro mostra "R$ 9,90/mês por grupo", o trial e os recursos Pro', () => {
    montar();
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText('R$ 9,90/mês por grupo')).toBeDefined();
    expect(within(pro).getByText('14 dias de Pro grátis, sem cartão')).toBeDefined();
    for (const item of [
      'Simulador de times',
      'Financeiro: mensalidades e caixa',
      'PDF do ranking',
      'Avisos no celular',
      'Jogadores ilimitados',
    ]) {
      expect(within(pro).getByText(item)).toBeDefined();
    }
  });

  it('PLA-61: o rodapé tem os links de termos e privacidade', () => {
    const { container } = montar();
    // O rodapé fica dentro do `main` da Casca: é `footer`, mas não é a landmark `contentinfo`.
    const rodape = container.querySelector('footer');
    if (!rodape) throw new Error('sem rodapé');
    expect(within(rodape).getByRole('link', { name: 'Termos de uso' }).getAttribute('href')).toBe(
      '/termos',
    );
    expect(within(rodape).getByRole('link', { name: 'Privacidade' }).getAttribute('href')).toBe(
      '/privacidade',
    );
  });

  it('PLA-63: com ?aviso=conta-excluida, a faixa "Sua conta foi excluída." aparece', () => {
    montar('/?aviso=conta-excluida');
    expect(screen.getByRole('status').textContent).toContain('Sua conta foi excluída.');
  });

  it('PLA-63: sem o aviso, a faixa não aparece', () => {
    montar('/');
    expect(screen.queryByText('Sua conta foi excluída.')).toBeNull();
  });

  it('PLA-65: axe sem violações', async () => {
    const { container } = montar('/?aviso=conta-excluida');
    await esperarSemViolacoes(container);
  });
});
