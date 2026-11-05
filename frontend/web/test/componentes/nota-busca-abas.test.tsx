import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Abas } from '../../src/componentes/Abas.tsx';
import { Busca } from '../../src/componentes/Busca.tsx';
import { CampoNota } from '../../src/componentes/CampoNota.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('CampoNota', () => {
  it('GEL-115: tem "–" e as notas de 1 a 10, mostra a atual; axe sem violação', async () => {
    const { container } = render(
      <ul>
        <li>
          <CampoNota id="h1" rotulo="Visão de Jogo" valor={8} aoMudar={() => {}} />
        </li>
      </ul>,
    );
    const seletor = screen.getByLabelText('Visão de Jogo') as HTMLSelectElement;
    expect(Array.from(seletor.options).map((o) => o.textContent)).toEqual([
      '–',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(seletor.value).toBe('8');
    expect(seletor.className).toContain('campo__entrada--nota');
    await esperarSemViolacoes(container);
  });

  it('GEL-97: escolher uma nota devolve o número inteiro', () => {
    const aoMudar = vi.fn();
    render(<CampoNota id="h2" rotulo="Passe" valor={null} aoMudar={aoMudar} />);
    const seletor = screen.getByLabelText('Passe') as HTMLSelectElement;
    expect(seletor.value).toBe('');
    fireEvent.change(seletor, { target: { value: '10' } });
    expect(aoMudar).toHaveBeenCalledWith(10);
  });

  it('GEL-98: limpar ("–") devolve null', () => {
    const aoMudar = vi.fn();
    render(<CampoNota id="h3" rotulo="Drible" valor={7} aoMudar={aoMudar} />);
    fireEvent.change(screen.getByLabelText('Drible'), { target: { value: '' } });
    expect(aoMudar).toHaveBeenCalledWith(null);
  });

  it('GEL-115: com erro, ligado por aria-describedby; axe sem violação', async () => {
    const { container } = render(
      <CampoNota id="h4" rotulo="Chute" valor={null} aoMudar={() => {}} erro="Não foi possível salvar a nota." />,
    );
    const seletor = screen.getByLabelText('Chute');
    expect(seletor.getAttribute('aria-invalid')).toBe('true');
    expect(seletor.getAttribute('aria-describedby')).toBe('h4-erro');
    expect(document.getElementById('h4-erro')?.textContent).toBe('Não foi possível salvar a nota.');
    await esperarSemViolacoes(container);
  });
});

describe('Busca', () => {
  it('GEL-115: campo de busca com rótulo para leitor de tela e placeholder; axe sem violação', async () => {
    const aoMudar = vi.fn();
    const { container } = render(<Busca id="busca" rotulo="Buscar jogador" valor="" aoMudar={aoMudar} />);
    const entrada = screen.getByRole('searchbox', { name: 'Buscar jogador' }) as HTMLInputElement;
    expect(entrada.type).toBe('search');
    expect(entrada.placeholder).toBe('Buscar jogador');
    expect(container.querySelector('label')?.className).toBe('sr');
    fireEvent.change(entrada, { target: { value: 'joão' } });
    expect(aoMudar).toHaveBeenCalledWith('joão');
    await esperarSemViolacoes(container);
  });
});

function AbasControladas({ aoMudar }: { aoMudar?: (c: 'ativos' | 'inativos') => void }) {
  const [ativa, setAtiva] = useState<'ativos' | 'inativos'>('ativos');
  return (
    <>
      <Abas
        id="filtro"
        rotulo="Mostrar"
        idPainel="painel"
        abas={[
          { chave: 'ativos', rotulo: 'Ativos', contagem: 20 },
          { chave: 'inativos', rotulo: 'Inativos', contagem: 0 },
        ]}
        ativa={ativa}
        aoMudar={(c) => {
          setAtiva(c);
          aoMudar?.(c);
        }}
      />
      <div id="painel" role="tabpanel" aria-labelledby={`filtro-${ativa}`}>
        conteúdo
      </div>
    </>
  );
}

describe('Abas', () => {
  it('anuncia a aba ativa com aria-selected e troca ao clicar', () => {
    const aoMudar = vi.fn();
    render(<AbasControladas aoMudar={aoMudar} />);
    const lista = screen.getByRole('tablist', { name: 'Mostrar' });
    expect(lista).toBeTruthy();
    const ativos = screen.getByRole('tab', { name: 'Ativos (20)' });
    const inativos = screen.getByRole('tab', { name: 'Inativos (0)' });
    expect(ativos.getAttribute('aria-selected')).toBe('true');
    expect(inativos.getAttribute('aria-selected')).toBe('false');
    expect(ativos.tabIndex).toBe(0);
    expect(inativos.tabIndex).toBe(-1);
    expect(ativos.getAttribute('aria-controls')).toBe('painel');

    fireEvent.click(inativos);
    expect(aoMudar).toHaveBeenCalledWith('inativos');
    expect(inativos.getAttribute('aria-selected')).toBe('true');
    expect(ativos.getAttribute('aria-selected')).toBe('false');
  });

  it('as setas movem a aba ativa e o foco, com volta ao começo', () => {
    render(<AbasControladas />);
    const ativos = screen.getByRole('tab', { name: 'Ativos (20)' });
    const inativos = screen.getByRole('tab', { name: 'Inativos (0)' });
    ativos.focus();
    fireEvent.keyDown(ativos, { key: 'ArrowRight' });
    expect(inativos.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(inativos);
    fireEvent.keyDown(inativos, { key: 'ArrowRight' });
    expect(ativos.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(ativos);
    fireEvent.keyDown(ativos, { key: 'End' });
    expect(inativos.getAttribute('aria-selected')).toBe('true');
  });

  it('GEL-115: abas com painel; axe sem violação', async () => {
    const { container } = render(<AbasControladas />);
    await esperarSemViolacoes(container);
    fireEvent.click(screen.getByRole('tab', { name: 'Inativos (0)' }));
    await esperarSemViolacoes(container);
  });
});
