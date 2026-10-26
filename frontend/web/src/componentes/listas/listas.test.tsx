// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/listas/listas.test.tsx

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { Interruptor } from '../escolhas/Interruptor';
import { Item, Lista, NavegadorMes, TabelaSemanas, TabelaSimples } from './index';

const RESPOSTAS = join(import.meta.dirname, '../../../../../.specs/mockup/respostas');
const json = <T,>(nome: string): T => JSON.parse(readFileSync(join(RESPOSTAS, nome), 'utf8')) as T;

interface SemanaUso {
  inicio: string;
  fim: string;
  aparelhosRanking: number;
  pdfsExportados: number;
  partidasLancadas: number;
  partidasEm48h: number;
  escalacoesConfirmadas: number;
}

describe('Lista e Item', () => {
  it('item link: <a> dentro de <li>, nome com título e meta, seta decorativa, Enter navega', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Lista rotulo="Partidas">
                <Item titulo="Quinta, 15/10/2026" meta="15 P · 0 L · 1 E" para="/partidas/2026-10-15" />
              </Lista>
            }
          />
          <Route path="/partidas/:data" element={<p>Tela da partida</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Quinta, 15\/10\/2026.*15 P/ });
    expect(link.closest('li')).not.toBeNull();
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    link.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('Tela da partida')).toBeInTheDocument();
  });

  it('item com ações: interruptor e botões alcançáveis por Tab, na ordem; quebra aplica a classe', async () => {
    render(
      <Lista>
        <Item
          titulo="Marquinhos"
          quebra
          acoes={
            <>
              <Interruptor
                rotuloAcessivel="Acessa financeiro: Marquinhos"
                marcado
                textoLigado="Financeiro"
                textoDesligado="Financeiro"
                aoMudar={() => undefined}
              />
              <button type="button">Remover</button>
            </>
          }
        />
      </Lista>,
    );
    expect(screen.getByRole('listitem').className).toContain('quebra');
    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveFocus();
  });

  it('sem violações do axe', async () => {
    const { container } = render(
      <MemoryRouter>
        <Lista rotulo="Itens">
          <Item titulo="A" meta="m" para="/a" />
          <Item titulo="B" lado="12" />
        </Lista>
      </MemoryRouter>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('NavegadorMes', () => {
  const { navegacao } = json('publico-ranking-2026-10.json') as {
    navegacao: { mesAnterior: string | null; mesSeguinte: string | null };
  };

  it('rótulo por extenso; anterior habilitado com o mês de destino; seguinte desabilitado', async () => {
    const aoTrocar = vi.fn();
    render(
      <NavegadorMes
        mes="2026-10"
        mesAnterior={navegacao.mesAnterior}
        mesSeguinte={navegacao.mesSeguinte}
        aoTrocar={aoTrocar}
      />,
    );
    expect(screen.getByRole('heading', { name: 'outubro de 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês seguinte' })).toBeDisabled();
    const anterior = screen.getByRole('button', { name: 'Mês anterior, setembro de 2026' });
    await userEvent.click(anterior);
    expect(aoTrocar).toHaveBeenCalledWith('2026-09');
    anterior.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(aoTrocar).toHaveBeenCalledTimes(3);
  });

  it('os dois limites nulos desabilitam os dois botões e nada dispara', async () => {
    const aoTrocar = vi.fn();
    render(<NavegadorMes mes="2026-10" mesAnterior={null} mesSeguinte={null} aoTrocar={aoTrocar} />);
    const botoes = screen.getAllByRole('button');
    for (const b of botoes) {
      expect(b).toBeDisabled();
      await userEvent.click(b);
    }
    expect(aoTrocar).not.toHaveBeenCalled();
  });

  it('sem violações do axe', async () => {
    const { container } = render(
      <NavegadorMes mes="2026-10" mesAnterior="2026-09" mesSeguinte={null} aoTrocar={() => undefined} />,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('TabelaSemanas', () => {
  const colunas = [
    { titulo: 'Aparelhos', tituloCurto: 'Aparelhos' },
    { titulo: 'PDFs', tituloCurto: 'PDFs' },
    { titulo: 'Partidas (em até 48 h)', tituloCurto: 'Partidas (em até 48 h)' },
    { titulo: 'Escalações / partidas', tituloCurto: 'Escalações / partidas' },
  ];
  const dd = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const semanas = json<{ semanas: SemanaUso[] }>('uso.json').semanas.map((s) => ({
    rotulo: `${dd(s.inicio)} a ${dd(s.fim)}`,
    valores: [
      String(s.aparelhosRanking),
      String(s.pdfsExportados),
      `${s.partidasLancadas} (${s.partidasEm48h})`,
      `${s.escalacoesConfirmadas} / ${s.partidasLancadas}`,
    ],
  }));

  it('tabela com cabeçalhos de coluna e de linha, e um cartão por semana', () => {
    render(<TabelaSemanas legenda="Uso por semana" colunas={colunas} semanas={semanas} />);
    const tabela = screen.getByRole('table', { name: 'Uso por semana' });
    expect(within(tabela).getAllByRole('columnheader')).toHaveLength(5);
    expect(within(tabela).getAllByRole('rowheader')).toHaveLength(4);
    const cartoes = screen.getAllByRole('heading', { level: 2, hidden: true });
    expect(cartoes.map((h) => h.textContent)).toEqual([
      '19/10 a 25/10',
      '12/10 a 18/10',
      '05/10 a 11/10',
      '28/09 a 04/10',
    ]);
  });

  it('sem semanas renderiza sem linhas e sem quebrar', () => {
    const vazio = json<{ semanas: SemanaUso[] }>('uso-vazio.json').semanas;
    render(<TabelaSemanas legenda="Uso" colunas={colunas} semanas={vazio.map(() => ({ rotulo: '', valores: [] }))} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryAllByRole('rowheader')).toHaveLength(0);
  });

  it('sem violações do axe (TabelaSimples e TabelaSemanas)', async () => {
    const { container } = render(
      <>
        <TabelaSimples legenda="Simples" colunas={['Nome', 'Valor']} linhas={[['A', '1']]} />
        <TabelaSemanas legenda="Uso por semana" colunas={colunas} semanas={semanas} />
      </>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});
