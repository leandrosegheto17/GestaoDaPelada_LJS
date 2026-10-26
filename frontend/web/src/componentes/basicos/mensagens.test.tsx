// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/basicos/mensagens.test.tsx

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { ErroRede } from './ErroRede';
import { EstadoVazio } from './EstadoVazio';
import { Faixa } from './Faixa';
import { Selo } from './Selo';
import { TelaMensagem } from './TelaMensagem';

describe('Faixa', () => {
  it.each([
    ['info', 'status'],
    ['sucesso', 'status'],
    ['atencao', 'status'],
    ['erro', 'alert'],
  ] as const)('tipo %s tem papel %s', (tipo, papel) => {
    render(<Faixa tipo={tipo}>Mensagem</Faixa>);
    expect(screen.getByRole(papel)).toHaveTextContent('Mensagem');
  });

  it('aceita o papel note e o ícone é decorativo', () => {
    const { container } = render(
      <Faixa tipo="info" papel="note">
        Instale o app
      </Faixa>,
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sem aoFechar não há botão; com aoFechar o botão tem nome acessível', async () => {
    const { rerender } = render(<Faixa tipo="info">Oi</Faixa>);
    expect(screen.queryByRole('button')).toBeNull();
    const aoFechar = vi.fn();
    rerender(
      <Faixa tipo="info" aoFechar={aoFechar} rotuloFechar="Fechar aviso de instalação">
        Oi
      </Faixa>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso de instalação' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('sem violações de acessibilidade', async () => {
    const { container } = render(
      <div>
        <Faixa tipo="erro">Erro</Faixa>
        <Faixa tipo="sucesso" aoFechar={() => undefined} rotuloFechar="Fechar">
          Ok
        </Faixa>
      </div>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Selo', () => {
  it('mostra o texto e aplica o tom', () => {
    render(<Selo tom="sucesso">Ativo</Selo>);
    expect(screen.getByText('Ativo').className).toContain('sucesso');
  });
});

describe('ErroRede', () => {
  it('texto exato e Tentar de novo chama aoTentar', async () => {
    const aoTentar = vi.fn();
    render(<ErroRede aoTentar={aoTentar} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar. Verifique a conexão.');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentar).toHaveBeenCalledTimes(1);
  });
});

describe('EstadoVazio e TelaMensagem', () => {
  it('EstadoVazio usa h2 por padrão e h3 quando pedido', () => {
    const { rerender } = render(<EstadoVazio titulo="Nada aqui" texto="Volte depois" acao={<a href="/x">Ir</a>} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Nada aqui' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir' })).toBeInTheDocument();
    rerender(<EstadoVazio titulo="Nada aqui" nivel={3} />);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('TelaMensagem tem main e h1', () => {
    render(<TelaMensagem titulo="Indisponível" texto="Tente mais tarde" />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Indisponível' })).toBeInTheDocument();
  });

  it('sem violações de acessibilidade', async () => {
    const { container } = render(
      <div>
        <EstadoVazio titulo="Vazio" texto="Texto" />
        <Selo>Neutro</Selo>
      </div>,
    );
    expect(await violacoes(container)).toEqual([]);
    const tela = render(<TelaMensagem titulo="Fora do ar" />);
    expect(await violacoes(tela.container)).toEqual([]);
  });
});
