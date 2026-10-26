// Critério: FUN-30 (componentes base: renderização e axe; CampoMoeda e NavegadorMes dependem desta formatação). Copiado do legado: frontend/web/src/componentes/campos/campos.test.tsx

import { LIMITES } from '@pelada/contrato';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import {
  Campo,
  CampoData,
  CampoHora,
  CampoMoeda,
  CampoNota,
  CampoNumero,
  CampoSenha,
  CampoSeletor,
  CampoTexto,
  ResumoErros,
} from './index';

describe('Campo', () => {
  it('liga rótulo, ajuda e erro à entrada, nessa ordem', () => {
    render(
      <Campo rotulo="Apelido" ajuda="Como o grupo te chama" erro="Já existe">
        {(e) => <input {...e} />}
      </Campo>,
    );
    const entrada = screen.getByLabelText('Apelido');
    const ids = entrada.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0] ?? '')).toHaveTextContent('Como o grupo te chama');
    expect(document.getElementById(ids[1] ?? '')).toHaveTextContent('Já existe');
    expect(entrada).toHaveAttribute('aria-invalid', 'true');
  });

  it('sem ajuda e sem erro não há describedby nem invalid', () => {
    render(<Campo rotulo="Nome">{(e) => <input {...e} />}</Campo>);
    const entrada = screen.getByLabelText('Nome');
    expect(entrada).not.toHaveAttribute('aria-describedby');
    expect(entrada).not.toHaveAttribute('aria-invalid');
  });

  it('só a ajuda: describedby tem um id', () => {
    render(
      <Campo rotulo="Nome" ajuda="Dica">
        {(e) => <input {...e} />}
      </Campo>,
    );
    expect(screen.getByLabelText('Nome').getAttribute('aria-describedby')?.split(' ')).toHaveLength(1);
  });

  it('erroComoAlerta põe role=alert no erro', () => {
    render(
      <Campo rotulo="Nome" erro="Obrigatório" erroComoAlerta>
        {(e) => <input {...e} />}
      </Campo>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório');
  });
});

describe('CampoSenha', () => {
  function Senha() {
    const [valor, setValor] = useState('');
    return <CampoSenha rotulo="Senha" valor={valor} aoMudar={setValor} autoComplete="current-password" />;
  }

  it('Mostrar alterna o tipo e aria-pressed', async () => {
    render(<Senha />);
    const entrada = screen.getByLabelText('Senha');
    const botao = screen.getByRole('button', { name: 'Mostrar' });
    expect(entrada).toHaveAttribute('type', 'password');
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    expect(botao).toHaveAttribute('aria-controls', entrada.id);
    await userEvent.click(botao);
    expect(entrada).toHaveAttribute('type', 'text');
    expect(botao).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(botao);
    expect(entrada).toHaveAttribute('type', 'password');
  });

  it('maxLength vem do contrato', () => {
    render(<Senha />);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('maxlength', String(LIMITES.senha.max));
  });
});

describe('CampoNumero', () => {
  function Numero({ inicial = 7 }: { inicial?: number }) {
    const [n, setN] = useState(inicial);
    return (
      <CampoNumero
        rotulo="Jogadores por time"
        valor={n}
        aoMudar={setN}
        min={LIMITES.jogadoresPorTime.min}
        max={LIMITES.jogadoresPorTime.max}
        rotuloDiminuir="Diminuir jogadores por time"
        rotuloAumentar="Aumentar jogadores por time"
      />
    );
  }

  it('botões mudam o valor e desabilitam nos limites', async () => {
    render(<Numero inicial={LIMITES.jogadoresPorTime.min} />);
    const menos = screen.getByRole('button', { name: 'Diminuir jogadores por time' });
    const mais = screen.getByRole('button', { name: 'Aumentar jogadores por time' });
    expect(menos).toBeDisabled();
    await userEvent.click(mais);
    expect(screen.getByLabelText('Jogadores por time')).toHaveValue(LIMITES.jogadoresPorTime.min + 1);
    expect(menos).toBeEnabled();
  });

  it('+ desabilitado no máximo', () => {
    render(<Numero inicial={LIMITES.jogadoresPorTime.max} />);
    expect(screen.getByRole('button', { name: 'Aumentar jogadores por time' })).toBeDisabled();
  });

  it('digitação fora da faixa é limitada', async () => {
    const aoMudar = vi.fn();
    render(
      <CampoNumero
        rotulo="N"
        valor={5}
        aoMudar={aoMudar}
        min={2}
        max={11}
        rotuloDiminuir="menos"
        rotuloAumentar="mais"
      />,
    );
    const entrada = screen.getByLabelText('N');
    await userEvent.clear(entrada);
    await userEvent.type(entrada, '99');
    expect(aoMudar).toHaveBeenLastCalledWith(11);
  });
});

describe('CampoMoeda', () => {
  const faixa = LIMITES.valorCentavos;

  async function digitar(texto: string, opcional = false) {
    const aoMudar = vi.fn();
    render(<CampoMoeda rotulo="Valor" centavos={null} aoMudar={aoMudar} faixa={faixa} opcional={opcional} />);
    const entrada = screen.getByLabelText('Valor');
    await userEvent.click(entrada);
    if (texto) await userEvent.type(entrada, texto);
    await userEvent.tab();
    return aoMudar;
  }

  it.each([
    ['350,00', 35000],
    ['1.234,5', 123450],
  ])('%s → %i centavos', async (texto, centavos) => {
    expect(await digitar(texto)).toHaveBeenLastCalledWith(centavos);
  });

  it.each([
    ['0', 'maior que zero'],
    ['abc', 'Informe um valor em reais'],
    ['1,234', 'no máximo 2 casas'],
    ['1.000.000,00', 'no máximo R\\$\\s999\\.999,99'],
    ['', 'Informe o valor'],
  ])('%j mostra erro', async (texto, trecho) => {
    await digitar(texto);
    expect(screen.getByText(new RegExp(trecho))).toBeInTheDocument();
  });

  it('vazio opcional devolve null sem erro', async () => {
    const aoMudar = await digitar('', true);
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/Informe/)).toBeNull();
  });
});

describe('CampoNota', () => {
  it('opções "–" e 1..10; "–" devolve null', async () => {
    const aoMudar = vi.fn();
    render(<CampoNota rotulo="Nota" nota={7} aoMudar={aoMudar} />);
    const opcoes = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['–', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]);
    await userEvent.selectOptions(screen.getByLabelText('Nota'), '–');
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    await userEvent.selectOptions(screen.getByLabelText('Nota'), '9');
    expect(aoMudar).toHaveBeenLastCalledWith(9);
  });
});

describe('ResumoErros', () => {
  it('1 erro não renderiza nada', () => {
    const { container } = render(<ResumoErros erros={[{ idCampo: 'a', rotulo: 'A' }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('2 erros: alerta, contagem e link que move o foco', async () => {
    render(
      <>
        <ResumoErros
          erros={[
            { idCampo: 'nova', rotulo: 'Nova senha' },
            { idCampo: 'conf', rotulo: 'Confirmar nova senha' },
          ]}
        />
        <input id="nova" aria-label="nova" />
        <input id="conf" aria-label="conf" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 2 campos:');
    await userEvent.click(screen.getByRole('link', { name: 'Confirmar nova senha' }));
    expect(screen.getByLabelText('conf')).toHaveFocus();
  });

  it('2 erros: o alerta leva a classe do resumo e a faixa de erro', () => {
    render(
      <ResumoErros
        erros={[
          { idCampo: 'a', rotulo: 'A' },
          { idCampo: 'b', rotulo: 'B' },
        ]}
      />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta.className).toMatch(/resumo/);
    expect(alerta).toHaveClass('faixa--erro');
  });

  it('2 erros: o alerta não mostra ícone', () => {
    render(
      <ResumoErros
        erros={[
          { idCampo: 'a', rotulo: 'A' },
          { idCampo: 'b', rotulo: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('alert').querySelector('svg')).toBeNull();
  });
});

describe('acessibilidade', () => {
  it('sem violações em todas as variantes, com e sem erro', async () => {
    const nada = () => undefined;
    const { container } = render(
      <form>
        <CampoTexto rotulo="Apelido" valor="" aoMudar={nada} maxLength={30} contador ajuda="Dica" />
        <CampoTexto rotulo="E-mail" valor="" aoMudar={nada} tipo="email" erro="Inválido" autoComplete="email" />
        <CampoSenha rotulo="Senha" valor="" aoMudar={nada} autoComplete="new-password" erro="Curta" />
        <CampoNumero
          rotulo="Qtd"
          valor={3}
          aoMudar={nada}
          min={1}
          max={5}
          rotuloDiminuir="menos"
          rotuloAumentar="mais"
        />
        <CampoData rotulo="Data" valor="2026-10-22" aoMudar={nada} />
        <CampoHora rotulo="Hora" valor="09:00" aoMudar={nada} />
        <CampoMoeda rotulo="Valor" centavos={35000} aoMudar={nada} faixa={LIMITES.valorCentavos} erro="Erro" />
        <CampoSeletor rotulo="Dia" valor="a" aoMudar={nada} opcoes={[{ valor: 'a', rotulo: 'A' }]} />
        <CampoNota rotulo="Nota" nota={null} aoMudar={nada} />
      </form>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});
