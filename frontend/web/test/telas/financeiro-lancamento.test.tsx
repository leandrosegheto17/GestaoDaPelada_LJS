import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { diaEHora, reaisParaCampo } from '../../src/telas/financeiro/Lancamento.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Tela Lançamento (financeiro T41; FIN-32, FIN-47), com as respostas do mockup (`financeiro-2026-10.json`,
 * `lancamento-aluguel.json`) e os textos de `t23-lancamento--{novo,edicao,erro,excluir}.html`.
 */

function resposta(nome: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../.specs/mockup/respostas/${nome}`, import.meta.url)),
      'utf8',
    ),
  );
}

const OUTUBRO = resposta('financeiro-2026-10.json');
const ALUGUEL = resposta('lancamento-aluguel.json') as Record<string, unknown>;

const BASE = '/app/grupos/g-quinta/financeiro';
const API = '/api/grupos/g-quinta/financeiro';

function abrir(caminho: string, api: Record<string, Manipulador>) {
  return abrirTela(caminho, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    [`GET ${API}/mes`]: () => json(200, OUTUBRO),
    ...api,
  });
}

function abrirNovo(api: Record<string, Manipulador> = {}) {
  return abrir(`${BASE}/lancamentos/novo`, api);
}

function abrirEdicao(
  lancamento: Record<string, unknown> = ALUGUEL,
  api: Record<string, Manipulador> = {},
) {
  return abrir(`${BASE}/lancamentos/l-aluguel`, {
    [`GET ${API}/lancamentos/l-aluguel`]: () => json(200, lancamento),
    ...api,
  });
}

function erro422(mensagens: Record<string, string>): Response {
  return json(422, {
    erro: 'Corrija os campos indicados.',
    codigo: 'dados_invalidos',
    campos: Object.keys(mensagens).sort(),
    mensagens,
  });
}

afterEach(() => {
  cleanup();
});

describe('Lançamento (t23)', () => {
  it('FIN-32: novo abre com Entrada, a data de hoje da resposta e "0 de 80"; digitar atualiza o contador', async () => {
    abrirNovo();
    expect(await screen.findByRole('heading', { name: 'Novo lançamento' })).toBeTruthy();
    const entrada = (await screen.findByRole('radio', { name: 'Entrada' })) as HTMLInputElement;
    expect(entrada.checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Saída' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-22');
    const descricao = screen.getByLabelText('Descrição') as HTMLInputElement;
    expect(descricao.maxLength).toBe(80);
    expect(screen.getByText('0 de 80')).toBeTruthy();
    fireEvent.change(descricao, { target: { value: 'Bola nova' } });
    expect(screen.getByText('9 de 80')).toBeTruthy();
    expect(screen.queryByText('0 de 80')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });

  it('FIN-32: a data do novo vem da API, não do relógio do aparelho', async () => {
    abrirNovo({
      [`GET ${API}/mes`]: () => json(200, { ...(OUTUBRO as object), hoje: '2026-10-03' }),
    });
    await waitFor(() =>
      expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-03'),
    );
  });

  it('FIN-25: salvar o novo envia o corpo em centavos e volta ao financeiro', async () => {
    const { chamadasA, local } = abrirNovo({
      [`POST ${API}/lancamentos`]: () =>
        json(201, {
          ...ALUGUEL,
          id: 'l-novo',
          tipo: 'saida',
          descricao: 'Bola nova',
          valorCentavos: 12050,
        }),
    });
    fireEvent.click(await screen.findByRole('radio', { name: 'Saída' }));
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Bola nova' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '120,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(local()).toBe(BASE));
    expect(chamadasA('POST', `${API}/lancamentos`)[0]?.corpo).toEqual({
      tipo: 'saida',
      data: '2026-10-22',
      descricao: 'Bola nova',
      valorCentavos: 12050,
    });
  });

  it('FIN-48: valor que não é reais marca o campo e não chama a API', async () => {
    const { chamadasA } = abrirNovo({ [`POST ${API}/lancamentos`]: () => json(201, ALUGUEL) });
    fireEvent.change(await screen.findByLabelText('Descrição'), { target: { value: 'Bola' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '12,345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe um valor em reais, ex.: 350,00.')).toBeTruthy();
    expect(screen.getByLabelText('Valor (R$)').getAttribute('aria-invalid')).toBe('true');
    expect(chamadasA('POST', `${API}/lancamentos`)).toHaveLength(0);
  });

  it('FIN-47: 422 com 2 campos mostra "Corrija 2 campos: Descrição, Valor" e a mensagem em cada campo; axe sem violação', async () => {
    const { container } = abrirNovo({
      [`POST ${API}/lancamentos`]: () =>
        erro422({
          descricao: 'A descrição precisa ter de 1 a 80 caracteres.',
          valorCentavos: 'Informe um valor inteiro em centavos dentro do limite.',
        }),
    });
    fireEvent.change(await screen.findByLabelText('Valor (R$)'), { target: { value: '0,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByRole('alert');
    expect(resumo.textContent).toContain('Corrija 2 campos:');
    expect(
      within(resumo)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Descrição', 'Valor']);
    const descricao = screen.getByLabelText('Descrição');
    const valor = screen.getByLabelText('Valor (R$)');
    expect(descricao.getAttribute('aria-invalid')).toBe('true');
    expect(valor.getAttribute('aria-invalid')).toBe('true');
    // A mensagem fica no próprio campo, ligada à entrada por `aria-describedby`.
    const idErroDescricao =
      (descricao.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .find((id) => id.endsWith('-erro')) ?? '';
    expect(document.getElementById(idErroDescricao)?.textContent).toBe(
      'A descrição precisa ter de 1 a 80 caracteres.',
    );
    expect(descricao.closest('div')?.textContent).toContain(
      'A descrição precisa ter de 1 a 80 caracteres.',
    );
    expect(valor.closest('div')?.textContent).toContain(
      'Informe um valor inteiro em centavos dentro do limite.',
    );
    await esperarSemViolacoes(container);
  });

  it('FIN-32: edição mostra os campos do lançamento e "Última alteração: Leandro, 15/10 20:41"', async () => {
    abrirEdicao({ ...ALUGUEL, alteradoPor: 'Leandro', alteradoEm: '2026-10-15T23:41:00Z' });
    expect(await screen.findByText('Última alteração: Leandro, 15/10 20:41')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Editar lançamento' })).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Saída' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Data') as HTMLInputElement).value).toBe('2026-10-05');
    expect((screen.getByLabelText('Descrição') as HTMLInputElement).value).toBe(
      'Aluguel da quadra outubro',
    );
    expect(screen.getByText('25 de 80')).toBeTruthy();
    expect((screen.getByLabelText('Valor (R$)') as HTMLInputElement).value).toBe('800,00');
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeTruthy();
  });

  it('FIN-32: autora excluída aparece como "Conta excluída", sem nome', async () => {
    abrirEdicao({ ...ALUGUEL, alteradoPor: 'Conta excluída', alteradoEm: '2026-10-15T23:41:00Z' });
    expect(await screen.findByText('Última alteração: Conta excluída, 15/10 20:41')).toBeTruthy();
    expect(screen.queryByText(/Leandro/)).toBeNull();
  });

  it('FIN-27: salvar a edição envia PUT no id', async () => {
    const { chamadasA, local } = abrirEdicao(ALUGUEL, {
      [`PUT ${API}/lancamentos/l-aluguel`]: () => json(200, { ...ALUGUEL, valorCentavos: 85000 }),
    });
    fireEvent.change(await screen.findByLabelText('Valor (R$)'), { target: { value: '850' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(local()).toBe(BASE));
    expect(chamadasA('PUT', `${API}/lancamentos/l-aluguel`)[0]?.corpo).toEqual({
      tipo: 'saida',
      data: '2026-10-05',
      descricao: 'Aluguel da quadra outubro',
      valorCentavos: 85000,
    });
  });

  it('FIN-32: Excluir mostra o texto exato do diálogo; Cancelar não chama a API', async () => {
    const { chamadasA } = abrirEdicao(ALUGUEL, {
      [`DELETE ${API}/lancamentos/l-aluguel`]: () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Excluir lançamento?' });
    expect(
      within(dialogo).getByText('“Aluguel da quadra outubro” (R$ 800,00) sai do caixa.'),
    ).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('DELETE', `${API}/lancamentos/l-aluguel`)).toHaveLength(0);
  });

  it('FIN-29: confirmar a exclusão faz DELETE e volta ao financeiro', async () => {
    const { chamadasA, local } = abrirEdicao(ALUGUEL, {
      [`DELETE ${API}/lancamentos/l-aluguel`]: () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir lançamento' }),
    );
    await waitFor(() => expect(local()).toBe(BASE));
    expect(chamadasA('DELETE', `${API}/lancamentos/l-aluguel`)).toHaveLength(1);
  });

  it('FIN-30: 409 lancamento_vinculado mostra a orientação e fica na tela', async () => {
    const orientacao =
      'Esta entrada é a mensalidade de Toninho 10/2026. Desmarque o pagamento no mês para removê-la.';
    const mensalidade = {
      ...ALUGUEL,
      tipo: 'entrada',
      descricao: 'Mensalidade Toninho 10/2026',
      valorCentavos: 7500,
      mensalidade: true,
    };
    const { local } = abrirEdicao(mensalidade, {
      [`DELETE ${API}/lancamentos/l-aluguel`]: () =>
        json(409, { erro: orientacao, codigo: 'lancamento_vinculado' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir lançamento' }),
    );
    expect(await screen.findByText(orientacao)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(local()).toBe(`${BASE}/lancamentos/l-aluguel`);
  });

  it('lançamento inexistente mostra "Lançamento não encontrado."', async () => {
    abrir(`${BASE}/lancamentos/l-outro`, {
      [`GET ${API}/lancamentos/l-outro`]: () =>
        json(404, { erro: 'Não encontrado.', codigo: 'nao_encontrado' }),
    });
    expect(await screen.findByText('Lançamento não encontrado.')).toBeTruthy();
  });
});

describe('auxiliares do lançamento', () => {
  it('reaisParaCampo tira o "R$" e mantém o sinal', () => {
    expect(reaisParaCampo(80000)).toBe('800,00');
    expect(reaisParaCampo(124550)).toBe('1.245,50');
    expect(reaisParaCampo(-1500)).toBe('−15,00');
  });

  it('FIN-49: diaEHora usa o fuso de São Paulo, não o UTC', () => {
    expect(diaEHora('2026-10-16T02:41:00Z')).toBe('15/10 23:41');
    expect(diaEHora('2026-10-05T12:14:00Z')).toBe('05/10 09:14');
  });
});
