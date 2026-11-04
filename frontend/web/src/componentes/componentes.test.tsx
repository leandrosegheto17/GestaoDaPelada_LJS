import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { Botao } from './Botao.tsx';
import { Casca } from './Casca.tsx';
import { EsqueletoLista } from './EsqueletoLista.tsx';
import { EstadoErro } from './EstadoErro.tsx';
import { Marca } from './Marca.tsx';

describe('Casca e Marca', () => {
  it('FUN-31: renderiza com título e entrega a landmark main', () => {
    render(
      <Casca titulo="Partidas">
        <p>conteúdo</p>
      </Casca>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Partidas' })).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('Gestão da Pelada');
  });

  it('FUN-31: renderiza sem título, sem h1 próprio', () => {
    render(<Casca>conteúdo</Casca>);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('FUN-31: a marca mostra o nome do produto', () => {
    render(<Marca />);
    expect(screen.getByText('Gestão da Pelada')).toBeInTheDocument();
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(
      <Casca titulo="Partidas">
        <p>conteúdo</p>
      </Casca>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Botao', () => {
  it.each([
    ['primario', 'primario'],
    ['secundario', 'secundario'],
  ] as const)(
    'FUN-31: a variante %s leva a classe %s e o clique dispara onClick',
    async (variante, classe) => {
      const aoClicar = vi.fn();
      render(
        <Botao variante={variante} onClick={aoClicar}>
          Salvar
        </Botao>,
      );
      const botao = screen.getByRole('button', { name: 'Salvar' });
      expect(botao).toHaveClass(classe);
      await userEvent.click(botao);
      expect(aoClicar).toHaveBeenCalledTimes(1);
    },
  );

  it('FUN-31: disabled não dispara o clique', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao disabled onClick={aoClicar}>
        Salvar
      </Botao>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('FUN-31: carregando não dispara o clique e avisa aria-busy', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao carregando onClick={aoClicar}>
        Salvar
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toHaveClass('carregando');
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });

  it('FUN-31: axe sem violações em cada variante', async () => {
    const { container } = render(
      <div>
        <Botao>Primário</Botao>
        <Botao variante="secundario">Secundário</Botao>
        <Botao disabled>Desabilitado</Botao>
        <Botao carregando>Carregando</Botao>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EstadoErro', () => {
  it('FUN-31: mostra a mensagem e chama aoTentarDeNovo ao clicar', async () => {
    const aoTentar = vi.fn();
    render(<EstadoErro mensagem="Servidor fora do ar." aoTentarDeNovo={aoTentar} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor fora do ar.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentar).toHaveBeenCalledTimes(1);
  });

  it('FUN-31: sem mensagem usa o texto do mockup', () => {
    render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar. Verifique a conexão.',
    );
  });

  it('FUN-31: o foco não se move sozinho (como no mockup) e o botão é alcançável pelo teclado', async () => {
    render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    expect(document.body).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus();
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EsqueletoLista', () => {
  it('FUN-31: renderiza o número de linhas pedido e aria-busy="true"', () => {
    const { container } = render(<EsqueletoLista linhas={4} />);
    expect(screen.getByTestId('esqueleto-lista').children).toHaveLength(4);
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });

  it('FUN-31: sem número pedido, renderiza 6 linhas como o mockup', () => {
    render(<EsqueletoLista />);
    expect(screen.getByTestId('esqueleto-lista').children).toHaveLength(6);
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(<EsqueletoLista />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
