// Crit�rio: FUN-30 (componentes base: renderiza��o e axe). Copiado do legado: frontend/web/src/componentes/dialogos/dialogos.test.tsx

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { Dialogo, Folha, ListaFolha, OpcaoFolha } from './index';

function ComDialogo(props: {
  destrutivo?: boolean;
  focoNoCancelar?: boolean;
  semFocaveis?: boolean;
  focoNoTitulo?: boolean;
  aoFechar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir
      </button>
      {aberto ? (
        <Dialogo
          titulo="Excluir partida"
          descricao="Isso não pode ser desfeito."
          destrutivo={props.destrutivo}
          focoNoTitulo={props.focoNoTitulo}
          refFocoInicial={props.focoNoCancelar ? cancelar : undefined}
          aoFechar={() => {
            props.aoFechar?.();
            setAberto(false);
          }}
          acoes={
            props.semFocaveis ? undefined : (
              <>
                <button type="button" ref={cancelar}>
                  Cancelar
                </button>
                <button type="button">Excluir</button>
              </>
            )
          }
        />
      ) : null}
    </>
  );
}

describe('Dialogo', () => {
  it('papéis, modal, nome e descrição', async () => {
    render(<ComDialogo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialogo = screen.getByRole('dialog', { name: 'Excluir partida' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveAccessibleDescription('Isso não pode ser desfeito.');
  });

  it('destrutivo é alertdialog', async () => {
    render(<ComDialogo destrutivo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('alertdialog', { name: 'Excluir partida' })).toBeInTheDocument();
  });

  it('foco inicial: primeiro focável por padrão; refFocoInicial quando dado', async () => {
    const { unmount } = render(<ComDialogo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    unmount();
    render(<ComDialogo focoNoCancelar />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('foco preso: Tab circula e Shift+Tab volta ao último', async () => {
    render(<ComDialogo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const excluir = screen.getByRole('button', { name: 'Excluir' });
    await userEvent.tab();
    expect(excluir).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(excluir).toHaveFocus();
  });

  it('com foco no título: Shift+Tab leva ao último focável e Tab ao primeiro', async () => {
    render(<ComDialogo focoNoTitulo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const titulo = screen.getByRole('heading', { name: 'Excluir partida' });
    expect(titulo).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('sem focáveis, o foco fica no próprio diálogo', async () => {
    render(<ComDialogo semFocaveis />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveFocus();
    await userEvent.tab();
    expect(dialogo).toHaveFocus();
  });

  it('Esc fecha o não destrutivo e devolve o foco; o destrutivo ignora Esc', async () => {
    const aoFechar = vi.fn();
    const { unmount } = render(<ComDialogo aoFechar={aoFechar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.keyboard('{Escape}');
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
    unmount();

    const aoFecharDestrutivo = vi.fn();
    render(<ComDialogo destrutivo aoFechar={aoFecharDestrutivo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.keyboard('{Escape}');
    expect(aoFecharDestrutivo).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('a rolagem do corpo fica bloqueada só enquanto aberto', async () => {
    render(<ComDialogo />);
    expect(document.body).not.toHaveClass('rolagem-bloqueada');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.body).toHaveClass('rolagem-bloqueada');
    await userEvent.keyboard('{Escape}');
    expect(document.body).not.toHaveClass('rolagem-bloqueada');
  });

  it('se o botão que abriu foi removido, fechar não quebra', async () => {
    function Efemero() {
      const [estado, setEstado] = useState<'fechado' | 'aberto' | 'removido'>('fechado');
      return (
        <>
          {estado !== 'removido' ? (
            <button type="button" onClick={() => setEstado('aberto')}>
              Abrir
            </button>
          ) : null}
          {estado === 'aberto' ? (
            <Dialogo titulo="Aviso" aoFechar={() => setEstado('removido')} acoes={<button type="button">Ok</button>} />
          ) : null}
        </>
      );
    }
    render(<Efemero />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem violações do axe', async () => {
    render(<ComDialogo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await violacoes(screen.getByRole('dialog'))).toEqual([]);
  });
});

function ComFolha({ aoFechar, aoEscolher }: { aoFechar: () => void; aoEscolher?: () => void }) {
  return (
    <MemoryRouter>
      <Folha titulo="Mover para" aoFechar={aoFechar}>
        <ListaFolha>
          <OpcaoFolha atual aoEscolher={aoEscolher ?? (() => undefined)}>
            Time A
          </OpcaoFolha>
          <OpcaoFolha para="/outro">Time B</OpcaoFolha>
        </ListaFolha>
      </Folha>
    </MemoryRouter>
  );
}

describe('Folha', () => {
  it('é um diálogo modal nomeado pelo título', () => {
    render(<ComFolha aoFechar={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Mover para' })).toHaveAttribute('aria-modal', 'true');
  });

  it('Esc e clique no véu fecham; clique dentro não', async () => {
    const aoFechar = vi.fn();
    render(<ComFolha aoFechar={aoFechar} />);
    await userEvent.click(screen.getByRole('dialog'));
    expect(aoFechar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(aoFechar).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(aoFechar).toHaveBeenCalledTimes(2);
  });

  it('opção atual tem aria-current e o texto "atual"; escolher chama aoEscolher (clique e Enter)', async () => {
    const aoEscolher = vi.fn();
    render(<ComFolha aoFechar={() => undefined} aoEscolher={aoEscolher} />);
    const atual = screen.getByRole('button', { name: /Time A/ });
    expect(atual).toHaveAttribute('aria-current', 'true');
    expect(atual).toHaveTextContent('atual');
    await userEvent.click(atual);
    atual.focus();
    await userEvent.keyboard('{Enter}');
    expect(aoEscolher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Time B' })).toHaveAttribute('href', '/outro');
  });

  it('sem violações do axe', async () => {
    render(<ComFolha aoFechar={() => undefined} />);
    expect(await violacoes(screen.getByRole('dialog'))).toEqual([]);
  });
});
