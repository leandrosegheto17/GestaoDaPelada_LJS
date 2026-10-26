// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/escolhas/escolhas.test.tsx

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { CaixaSelecao, Interruptor, Segmentado } from './index';

const OPCOES = [
  { valor: 'ativos', rotulo: 'Ativos (20)' },
  { valor: 'inativos', rotulo: 'Inativos (0)' },
] as const;

function SegmentadoControlado({ aoMudar }: { aoMudar?: (v: string) => void }) {
  const [valor, setValor] = useState<'ativos' | 'inativos'>('ativos');
  return (
    <>
      <Segmentado
        legenda="Mostrar"
        opcoes={OPCOES}
        valor={valor}
        aoMudar={(v) => {
          setValor(v);
          aoMudar?.(v);
        }}
      />
      <button type="button">depois</button>
    </>
  );
}

describe('Segmentado', () => {
  it('é um grupo nomeado pela legenda, com a opção marcada', () => {
    render(<SegmentadoControlado />);
    expect(screen.getByRole('group', { name: 'Mostrar' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ativos (20)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Inativos (0)' })).not.toBeChecked();
  });

  it('clicar em outra opção chama aoMudar', async () => {
    const aoMudar = vi.fn();
    render(<SegmentadoControlado aoMudar={aoMudar} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Inativos (0)' }));
    expect(aoMudar).toHaveBeenCalledWith('inativos');
    expect(screen.getByRole('radio', { name: 'Inativos (0)' })).toBeChecked();
  });

  it('Tab entra no grupo uma vez, na opção marcada, e a seguinte sai dele', async () => {
    render(<SegmentadoControlado />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Ativos (20)' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'depois' })).toHaveFocus();
  });

  it.each(['{ArrowRight}', '{ArrowDown}'])('%s seleciona a próxima opção e chama aoMudar', async (tecla) => {
    const aoMudar = vi.fn();
    render(<SegmentadoControlado aoMudar={aoMudar} />);
    await userEvent.tab();
    await userEvent.keyboard(tecla);
    expect(aoMudar).toHaveBeenCalledWith('inativos');
    expect(screen.getByRole('radio', { name: 'Inativos (0)' })).toBeChecked();
  });

  it('ArrowLeft na primeira opção volta à última', async () => {
    const aoMudar = vi.fn();
    render(<SegmentadoControlado aoMudar={aoMudar} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowLeft}');
    expect(aoMudar).toHaveBeenCalledWith('inativos');
    expect(screen.getByRole('radio', { name: 'Inativos (0)' })).toHaveFocus();
  });
});

function InterruptorControlado(props: { desabilitado?: boolean; rotuloAcessivel?: string }) {
  const [marcado, setMarcado] = useState(false);
  return (
    <Interruptor
      rotulo={props.rotuloAcessivel ? undefined : 'Choveu?'}
      rotuloAcessivel={props.rotuloAcessivel}
      marcado={marcado}
      aoMudar={setMarcado}
      textoLigado="Sim"
      textoDesligado="Não"
      desabilitado={props.desabilitado}
    />
  );
}

describe('Interruptor', () => {
  it('Espaço alterna e o texto visível troca', async () => {
    render(<InterruptorControlado />);
    const chave = screen.getByRole('switch', { name: /Choveu\?/ });
    expect(screen.getByText('Não')).toBeInTheDocument();
    chave.focus();
    await userEvent.keyboard(' ');
    expect(chave).toBeChecked();
    expect(screen.getByText('Sim')).toBeInTheDocument();
  });

  it('desabilitado não muda', async () => {
    render(<InterruptorControlado desabilitado />);
    await userEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('rotuloAcessivel dá o nome quando não há rótulo visível', () => {
    render(<InterruptorControlado rotuloAcessivel="Acessa financeiro: Leandro" />);
    expect(screen.getByRole('switch', { name: 'Acessa financeiro: Leandro' })).toBeInTheDocument();
  });
});

describe('CaixaSelecao', () => {
  it('Espaço marca e desmarca; o nome vem do rótulo', async () => {
    function Caixa() {
      const [marcada, setMarcada] = useState(false);
      return <CaixaSelecao rotulo="Ilimitado" marcada={marcada} aoMudar={setMarcada} />;
    }
    render(<Caixa />);
    const caixa = screen.getByRole('checkbox', { name: 'Ilimitado' });
    caixa.focus();
    await userEvent.keyboard(' ');
    expect(caixa).toBeChecked();
    await userEvent.keyboard(' ');
    expect(caixa).not.toBeChecked();
  });
});

describe('alvo de toque e acessibilidade', () => {
  it.each(['Segmentado', 'Interruptor', 'CaixaSelecao'])('%s tem min-height com o token de toque', (nome) => {
    const css = readFileSync(join(import.meta.dirname, `${nome}.module.css`), 'utf8');
    expect(css).toContain('min-height: var(--alvo-toque)');
  });

  it('sem violações do axe', async () => {
    const nada = () => undefined;
    const { container } = render(
      <div>
        <Segmentado legenda="Mostrar" opcoes={OPCOES} valor="ativos" aoMudar={nada} />
        <Interruptor rotulo="Choveu?" marcado textoLigado="Sim" textoDesligado="Não" aoMudar={nada} />
        <Interruptor
          rotuloAcessivel="Acessa financeiro: Ana"
          marcado={false}
          textoLigado="F"
          textoDesligado="F"
          aoMudar={nada}
          desabilitado
        />
        <CaixaSelecao rotulo="Ilimitado" marcada={false} aoMudar={nada} />
      </div>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});
