// Crit�rio: FUN-30 (componentes base: renderiza��o e axe). Copiado do legado: frontend/web/src/componentes/barras/barras.test.tsx

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { recursos } from '../../config/recursos';
import { BarraAcao, BarraAdmin, BarraDono, BarraSuperior, PularConteudo } from './index';

vi.mock('../../config/recursos', () => ({ recursos: { ligado: vi.fn(() => true) } }));

const dentro = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => vi.mocked(recursos.ligado).mockReturnValue(true));

describe('BarraSuperior (pública)', () => {
  const barra = (
    <BarraSuperior
      titulo="Pelada de Quinta"
      subtitulo="Toda quinta · 20:00"
      destinoAdmin="/entrar"
      destinoFinanceiro="/entrar?destino=%2Ffinanceiro"
    />
  );

  it('tem banner, h1 com o nome e a navegação dos admins', () => {
    dentro(barra);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Pelada de Quinta' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Acesso dos admins' });
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Área do admin' }));
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Financeiro' }));
  });

  it('esconde o "$" com o recurso financeiro desligado', () => {
    vi.mocked(recursos.ligado).mockReturnValue(false);
    dentro(barra);
    expect(screen.queryByRole('link', { name: 'Financeiro' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Área do admin' })).toBeInTheDocument();
  });

  it('ícones são decorativos', () => {
    const { container } = dentro(barra);
    for (const svg of container.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('BarraAdmin e BarraDono', () => {
  it('admin: Trocar grupo e Ver ranking conforme props; menu com aria-expanded', async () => {
    const aoAbrirMenu = vi.fn();
    const { rerender } = dentro(
      <BarraAdmin
        nomeGrupo="Pelada de Quinta"
        destinoTrocarGrupo="/admin"
        destinoRanking="/g/quinta"
        aoAbrirMenu={aoAbrirMenu}
      />,
    );
    expect(screen.getByText('Pelada de Quinta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trocar grupo' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Ver ranking' })).toHaveAttribute('href', '/g/quinta');
    const menu = screen.getByRole('button', { name: 'Menu da conta' });
    expect(menu).toHaveAttribute('aria-haspopup', 'true');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(aoAbrirMenu).toHaveBeenCalledTimes(1);
    rerender(
      <MemoryRouter>
        <BarraAdmin aoAbrirMenu={aoAbrirMenu} menuAberto />
      </MemoryRouter>,
    );
    expect(screen.getByText('Gestão da Pelada')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trocar grupo' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ver ranking' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu da conta' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('dono: textos e link', () => {
    dentro(<BarraDono destinoMeusGrupos="/admin" aoAbrirMenu={() => undefined} />);
    expect(screen.getByText('Área do dono')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meus grupos como admin' })).toHaveAttribute('href', '/admin');
  });
});

describe('PularConteudo', () => {
  it('é o primeiro Tab e Enter leva o foco ao conteúdo', async () => {
    render(
      <>
        <PularConteudo texto="Pular para o ranking" />
        <button type="button">outro</button>
        <main id="conteudo" tabIndex={-1}>
          Conteúdo
        </main>
      </>,
    );
    await userEvent.tab();
    const link = screen.getByRole('link', { name: 'Pular para o ranking' });
    expect(link).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('BarraAcao', () => {
  it('renderiza os filhos e a classe só-celular quando pedida', () => {
    const { container, rerender } = render(
      <BarraAcao resumo="3 selecionados">
        <button type="button">Salvar</button>
      </BarraAcao>,
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
    expect(container.firstElementChild?.className).not.toContain('soCelular');
    rerender(
      <BarraAcao soCelular>
        <button type="button">Salvar</button>
      </BarraAcao>,
    );
    expect(container.firstElementChild?.className).toContain('soCelular');
  });

  it('o CSS torna a barra estática a partir de 600 px', () => {
    const css = readFileSync(join(import.meta.dirname, 'BarraAcao.module.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 600px\)[\s\S]*position: static/);
  });
});

describe('acessibilidade', () => {
  const variantes: Array<[string, React.ReactElement]> = [
    ['pública', <BarraSuperior key="p" titulo="Pelada" destinoAdmin="/entrar" destinoFinanceiro="/f" />],
    [
      'admin',
      <BarraAdmin
        key="a"
        nomeGrupo="Pelada"
        destinoTrocarGrupo="/admin"
        destinoRanking="/g/p"
        aoAbrirMenu={() => undefined}
      />,
    ],
    ['dono', <BarraDono key="d" destinoMeusGrupos="/admin" aoAbrirMenu={() => undefined} />],
  ];

  it.each(variantes)('barra %s com pular e barra de ação: sem violações do axe', async (_nome, barra) => {
    const { container } = dentro(
      <>
        <PularConteudo />
        {barra}
        <main id="conteudo" tabIndex={-1}>
          <BarraAcao>
            <button type="button">Ok</button>
          </BarraAcao>
        </main>
      </>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});
