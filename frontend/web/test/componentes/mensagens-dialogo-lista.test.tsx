import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Botao } from '../../src/componentes/Botao.tsx';
import { Dialogo } from '../../src/componentes/Dialogo.tsx';
import { Faixa } from '../../src/componentes/Faixa.tsx';
import { ItemLista, Lista } from '../../src/componentes/Lista.tsx';
import { TelaMensagem } from '../../src/componentes/TelaMensagem.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('Faixa', () => {
  it('ACE-56: sucesso usa role="status" e a classe faixa--sucesso, como em t32-conta--excluida', () => {
    render(<Faixa tipo="sucesso">Sua conta foi excluída.</Faixa>);
    const faixa = screen.getByRole('status');
    expect(faixa.className).toContain('faixa--sucesso');
    expect(faixa.textContent).toBe('Sua conta foi excluída.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ACE-56: erro usa role="alert"', () => {
    render(<Faixa tipo="erro">Não conseguimos enviar o e-mail agora.</Faixa>);
    const faixa = screen.getByRole('alert');
    expect(faixa.className).toContain('faixa--erro');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ACE-56: atenção e info usam role="status"', () => {
    render(
      <>
        <Faixa tipo="atencao">Este link já foi usado ou passou do prazo de 24 horas.</Faixa>
        <Faixa tipo="info" titulo="Confirme seu e-mail para entrar">
          Enviamos o link para o seu e-mail.
        </Faixa>
      </>,
    );
    const faixas = screen.getAllByRole('status');
    expect(faixas.map((f) => f.className.includes('faixa--atencao') || f.className.includes('faixa--info'))).toEqual([true, true]);
    expect(faixas[1]!.querySelector('strong')?.textContent).toBe('Confirme seu e-mail para entrar');
  });

  it('ACE-56: axe sem violação nos quatro tipos, com ação', async () => {
    const { container } = render(
      <>
        <Faixa tipo="sucesso">Ok.</Faixa>
        <Faixa tipo="erro">Erro.</Faixa>
        <Faixa tipo="atencao">Atenção.</Faixa>
        <Faixa tipo="info" acao={<Botao variante="texto">Reenviar link</Botao>}>
          Info.
        </Faixa>
      </>,
    );
    await esperarSemViolacoes(container);
  });
});

describe('TelaMensagem', () => {
  it('ACE-56: mostra título, texto e ação, e o foco vai ao título', async () => {
    const { container } = render(
      <main>
        <TelaMensagem icone="sucesso" titulo="E-mail confirmado" acao={<a href="/entrar">Entrar</a>}>
          Agora você já pode entrar.
        </TelaMensagem>
      </main>,
    );
    const titulo = screen.getByRole('heading', { level: 1, name: 'E-mail confirmado' });
    expect(document.activeElement).toBe(titulo);
    expect(screen.getByText('Agora você já pode entrar.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await esperarSemViolacoes(container);
  });
});

function ComDialogo({ aoFechar = vi.fn() }: { aoFechar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao onClick={() => setAberto(true)}>Excluir minha conta</Botao>
      {aberto ? (
        <Dialogo
          alerta
          titulo="Excluir sua conta?"
          descricao="Não dá para desfazer. Digite sua senha para confirmar."
          aoFechar={() => {
            aoFechar();
            setAberto(false);
          }}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Cancelar
              </Botao>
              <Botao>Excluir conta</Botao>
            </>
          }
        >
          <label htmlFor="senha-excluir">Senha</label>
          <input id="senha-excluir" type="password" />
        </Dialogo>
      ) : null}
    </>
  );
}

describe('Dialogo', () => {
  it('ACE-56: abre como alertdialog modal, com título e texto ligados, e o foco no autoFocus', async () => {
    const { container } = render(<ComDialogo />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Excluir sua conta?' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    const descricao = document.getElementById(dialogo.getAttribute('aria-describedby') ?? '');
    expect(descricao?.textContent).toBe('Não dá para desfazer. Digite sua senha para confirmar.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    await esperarSemViolacoes(container);
  });

  it('ACE-56: sem alerta, é role="dialog"; sem autoFocus, o foco vai ao primeiro focável', () => {
    render(
      <Dialogo titulo="Menu da conta" aoFechar={() => undefined}>
        <a href="/app/conta">Minha conta</a>
      </Dialogo>,
    );
    expect(screen.getByRole('dialog', { name: 'Menu da conta' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }));
  });

  it('ACE-56: prende o foco: Tab no último volta ao primeiro, Shift+Tab no primeiro vai ao último', () => {
    render(<ComDialogo />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const dialogo = screen.getByRole('alertdialog');
    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const excluir = screen.getByRole('button', { name: 'Excluir conta' });

    excluir.focus();
    fireEvent.keyDown(dialogo, { key: 'Tab' });
    expect(document.activeElement).toBe(fechar);

    fireEvent.keyDown(dialogo, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(excluir);
  });

  it('ACE-56: Esc fecha e o foco volta ao botão que abriu', () => {
    const aoFechar = vi.fn();
    render(<ComDialogo aoFechar={aoFechar} />);
    const abrir = screen.getByRole('button', { name: 'Excluir minha conta' });
    abrir.focus();
    fireEvent.click(abrir);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('ACE-56: o botão Fechar chama aoFechar', () => {
    const aoFechar = vi.fn();
    render(<ComDialogo aoFechar={aoFechar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe('Lista', () => {
  it('ACE-56: itens com título e meta; com para, o item é um link do app; axe sem violação', async () => {
    const { container } = render(
      <MemoryRouter>
        <Lista rotulo="Seus grupos">
          <ItemLista titulo="Pelada de Quinta" meta="Quintas, 20h" para="/app/grupos/g-quinta/admins" />
          <ItemLista titulo="Ana" meta="ana@exemplo.test" />
        </Lista>
      </MemoryRouter>,
    );
    const lista = screen.getByRole('list', { name: 'Seus grupos' });
    expect(lista.className).toContain('lista');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const link = screen.getByRole('link', { name: /Pelada de Quinta/ });
    expect(link.getAttribute('href')).toBe('/app/grupos/g-quinta/admins');
    expect(link.className).toContain('item');
    expect(screen.getByText('ana@exemplo.test').className).toContain('item__meta');
    await esperarSemViolacoes(container);
  });
});
