import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Casca, NOME_DO_APP } from '../../src/componentes/Casca.tsx';
import { Marca } from '../../src/componentes/Marca.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('Casca', () => {
  it('FUN-31: com título, entrega a landmark main com o h1 da página', () => {
    render(
      <Casca titulo="Partidas" grupo={{ nome: 'Pelada de Quinta', trocarHref: '/grupos' }}>
        <p>conteúdo</p>
      </Casca>,
    );
    const main = screen.getByRole('main');
    expect(main.querySelector('h1')?.textContent).toBe('Partidas');
    expect(main.textContent).toContain('conteúdo');
    expect(screen.getByRole('banner').textContent).toContain('Pelada de Quinta');
    expect(screen.getByRole('link', { name: 'Trocar grupo' }).getAttribute('href')).toBe('/grupos');
  });

  it('FUN-31: sem título, entrega a landmark main sem h1 e a barra pública com o nome do app', () => {
    render(
      <Casca centralizada>
        <h1>Grupo indisponível</h1>
      </Casca>,
    );
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner').textContent).toBe(NOME_DO_APP);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('FUN-31: as classes seguem o mockup (barra do admin, conteúdo e tela de mensagem)', () => {
    const { container, rerender } = render(<Casca titulo="X" grupo={{ nome: 'G' }} />);
    expect(container.querySelector('header')?.className).toContain('barra--admin');
    expect(container.querySelector('main')?.className).toContain('conteudo--admin');
    rerender(<Casca centralizada />);
    expect(container.querySelector('main')?.className).toContain('tela-mensagem');
    expect(container.querySelector('header')?.className).not.toContain('barra--admin');
  });

  it('FUN-31: ocupada marca o main com aria-busy', () => {
    render(<Casca titulo="Jogadores" ocupada />);
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
  });

  it('FUN-31: axe sem violações, com e sem título', async () => {
    const { container, rerender } = render(<Casca titulo="Partidas" grupo={{ nome: 'Pelada', trocarHref: '/g' }} />);
    await esperarSemViolacoes(container);
    rerender(
      <Casca centralizada>
        <h1>Em breve</h1>
      </Casca>,
    );
    await esperarSemViolacoes(container);
  });
});

describe('Marca', () => {
  for (const [situacao, letra] of [
    ['presente', 'p'],
    ['lesionado', 'l'],
    ['expulso', 'e'],
    ['falta', 'f'],
    ['sem', 'x'],
  ] as const) {
    it(`FUN-31: ${situacao} usa a classe marca--${letra}`, () => {
      const { container } = render(<Marca situacao={situacao} valor="1" />);
      const el = container.firstElementChild;
      expect(el?.className).toContain('marca');
      expect(el?.className).toContain(`marca--${letra}`);
    });
  }

  it('FUN-31: com rótulo, o leitor de tela lê o rótulo e não o número solto', () => {
    const { container } = render(<Marca situacao="lesionado" valor={1} rotulo="Lesionado, 1 ponto" />);
    expect(container.textContent).toContain('Lesionado, 1 ponto');
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('1');
  });

  it('FUN-31: sem rótulo, a marca é decorativa', () => {
    const { container } = render(<Marca situacao="presente" valor={2} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(
      <div>
        <Marca situacao="presente" valor={1} rotulo="Presente, 1 ponto" />
        <Marca situacao="falta" valor={0} />
      </div>,
    );
    await esperarSemViolacoes(container);
  });
});
