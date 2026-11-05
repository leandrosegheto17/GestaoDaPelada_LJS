import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampoData } from '../../src/componentes/CampoData.tsx';
import { CampoHora } from '../../src/componentes/CampoHora.tsx';
import { CampoSeletor, OPCOES_DIA_SEMANA, OPCOES_FREQUENCIA } from '../../src/componentes/CampoSeletor.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('CampoData', () => {
  it('GEL-115: estado normal é input date com min e max; axe sem violação', async () => {
    const { container } = render(
      <CampoData id="entrada" rotulo="Data de entrada" min="2026-01-01" max="2026-10-22" defaultValue="2026-10-22" />,
    );
    const entrada = screen.getByLabelText('Data de entrada') as HTMLInputElement;
    expect(entrada.type).toBe('date');
    expect(entrada.min).toBe('2026-01-01');
    expect(entrada.max).toBe('2026-10-22');
    expect(entrada.value).toBe('2026-10-22');
    expect(entrada.getAttribute('aria-invalid')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-115: com erro, o erro está ligado por aria-describedby; axe sem violação', async () => {
    const { container } = render(<CampoData id="entrada" rotulo="Data de entrada" erro="Informe a data de entrada." />);
    const entrada = screen.getByLabelText('Data de entrada');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.getAttribute('aria-describedby')).toBe('entrada-erro');
    expect(document.getElementById('entrada-erro')?.textContent).toBe('Informe a data de entrada.');
    await esperarSemViolacoes(container);
  });
});

describe('CampoHora', () => {
  it('GEL-115: estado normal é input time; axe sem violação', async () => {
    const { container } = render(<CampoHora id="hora" rotulo="Horário" defaultValue="20:00" />);
    const entrada = screen.getByLabelText('Horário') as HTMLInputElement;
    expect(entrada.type).toBe('time');
    expect(entrada.value).toBe('20:00');
    expect(entrada.getAttribute('aria-invalid')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-115: com erro "Horário inválido.", ligado por aria-describedby; axe sem violação', async () => {
    const { container } = render(<CampoHora id="hora" rotulo="Horário" erro="Horário inválido." />);
    const entrada = screen.getByLabelText('Horário');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.getAttribute('aria-describedby')).toBe('hora-erro');
    expect(document.getElementById('hora-erro')?.textContent).toBe('Horário inválido.');
    expect(container.querySelector('[class*="campo--erro"]')).toBeTruthy();
    await esperarSemViolacoes(container);
  });
});

describe('CampoSeletor', () => {
  it('mostra as opções de dia da semana, na ordem do contrato, e devolve o valor escolhido', () => {
    const aoMudar = vi.fn();
    render(<CampoSeletor id="dia" rotulo="Dia da semana" opcoes={OPCOES_DIA_SEMANA} valor="quinta" aoMudar={aoMudar} />);
    const seletor = screen.getByLabelText('Dia da semana') as HTMLSelectElement;
    expect(seletor.tagName).toBe('SELECT');
    expect(Array.from(seletor.options).map((o) => o.textContent)).toEqual([
      'Domingo',
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
    ]);
    expect(seletor.value).toBe('quinta');
    fireEvent.change(seletor, { target: { value: 'terca' } });
    expect(aoMudar).toHaveBeenCalledWith('terca');
  });

  it('com opção vazia, a lista começa por ela e nada é escolhido', () => {
    render(
      <CampoSeletor
        id="pos"
        rotulo="Posição"
        opcoes={[{ valor: 'meia', rotulo: 'Meia' }]}
        valor=""
        aoMudar={() => {}}
        opcaoVazia="Escolha"
      />,
    );
    const seletor = screen.getByLabelText('Posição') as HTMLSelectElement;
    expect(Array.from(seletor.options).map((o) => o.textContent)).toEqual(['Escolha', 'Meia']);
    expect(seletor.value).toBe('');
  });

  it('mostra as opções de frequência no segmentado e marca a escolhida', () => {
    const aoMudar = vi.fn();
    render(
      <CampoSeletor
        id="frequencia"
        rotulo="Frequência"
        variante="segmentado"
        opcoes={OPCOES_FREQUENCIA}
        valor="semanal"
        aoMudar={aoMudar}
      />,
    );
    const grupo = screen.getByRole('radiogroup', { name: 'Frequência' });
    const radios = within(grupo).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Semanal', 'Quinzenal', 'Mensal']);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    fireEvent.click(within(grupo).getByLabelText('Mensal'));
    expect(aoMudar).toHaveBeenCalledWith('mensal');
  });

  it('GEL-115: lista no estado normal e com erro; axe sem violação', async () => {
    const { container, rerender } = render(
      <CampoSeletor id="dia" rotulo="Dia da semana" opcoes={OPCOES_DIA_SEMANA} valor="quinta" aoMudar={() => {}} />,
    );
    expect(screen.getByLabelText('Dia da semana').getAttribute('aria-invalid')).toBeNull();
    await esperarSemViolacoes(container);

    rerender(
      <CampoSeletor
        id="dia"
        rotulo="Dia da semana"
        opcoes={OPCOES_DIA_SEMANA}
        valor=""
        aoMudar={() => {}}
        opcaoVazia="Escolha"
        erro="Escolha o dia da semana."
      />,
    );
    const seletor = screen.getByLabelText('Dia da semana');
    expect(seletor.getAttribute('aria-invalid')).toBe('true');
    expect(seletor.getAttribute('aria-describedby')).toBe('dia-erro');
    expect(document.getElementById('dia-erro')?.textContent).toBe('Escolha o dia da semana.');
    await esperarSemViolacoes(container);
  });

  it('GEL-115: segmentado no estado normal e com erro; axe sem violação', async () => {
    const { container, rerender } = render(
      <CampoSeletor
        id="frequencia"
        rotulo="Frequência"
        variante="segmentado"
        opcoes={OPCOES_FREQUENCIA}
        valor="semanal"
        aoMudar={() => {}}
      />,
    );
    await esperarSemViolacoes(container);

    rerender(
      <CampoSeletor
        id="frequencia"
        rotulo="Frequência"
        variante="segmentado"
        opcoes={OPCOES_FREQUENCIA}
        valor=""
        aoMudar={() => {}}
        erro="Escolha a frequência."
      />,
    );
    const grupo = screen.getByRole('radiogroup', { name: 'Frequência' });
    expect(grupo.getAttribute('aria-invalid')).toBe('true');
    expect(grupo.getAttribute('aria-describedby')).toBe('frequencia-erro');
    expect(document.getElementById('frequencia-erro')?.textContent).toBe('Escolha a frequência.');
    await esperarSemViolacoes(container);
  });
});
