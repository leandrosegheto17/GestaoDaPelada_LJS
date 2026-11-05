import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AJUDA_MENSALIDADE,
  ROTULO_DATA,
  ROTULO_MENSALIDADE,
  ROTULO_SALDO,
} from '../../src/telas/financeiro/ConfigCaixa.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Tela Configurar caixa (financeiro T42; FIN-48, FIN-47, FIN-02), com as respostas do mockup
 * (`financeiro-2026-10.json`, `financeiro-sem-config.json`) e os textos de `t24-config--{vazio,erro}.html`.
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
const SEM_CONFIG = resposta('financeiro-sem-config.json');

const BASE = '/app/grupos/g-quinta/financeiro';
const API = '/api/grupos/g-quinta/financeiro';
const MENSAGEM_REAIS = 'Informe um valor em reais, ex.: 350,00.';
const MENSAGEM_FUTURO = 'A data do saldo inicial não pode ser no futuro.';

function abrir(mes: unknown, api: Record<string, Manipulador> = {}) {
  return abrirTela(`${BASE}/config`, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    [`GET ${API}/mes`]: () => json(200, mes),
    ...api,
  });
}

const CONFIG_SALVA = {
  mensalidadeCentavos: null,
  saldoInicialCentavos: 35000,
  dataSaldoInicial: '2026-10-22',
};

afterEach(() => {
  cleanup();
});

describe('Configurar caixa (t24)', () => {
  it('sem configuração: campos vazios, a ajuda da mensalidade e a data de hoje da API; axe sem violação', async () => {
    const { container } = abrir(SEM_CONFIG);
    const mensalidade = (await screen.findByLabelText(ROTULO_MENSALIDADE)) as HTMLInputElement;
    expect(mensalidade.value).toBe('');
    expect(screen.getByText(AJUDA_MENSALIDADE)).toBeTruthy();
    expect((screen.getByLabelText(ROTULO_SALDO) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(ROTULO_DATA) as HTMLInputElement).value).toBe('2026-10-22');
    await esperarSemViolacoes(container);
  });

  it('com configuração: os valores gravados em reais', async () => {
    abrir(OUTUBRO);
    await waitFor(() =>
      expect((screen.getByLabelText(ROTULO_MENSALIDADE) as HTMLInputElement).value).toBe('75,00'),
    );
    expect((screen.getByLabelText(ROTULO_SALDO) as HTMLInputElement).value).toBe('350,00');
    expect((screen.getByLabelText(ROTULO_DATA) as HTMLInputElement).value).toBe('2026-02-05');
  });

  it('FIN-48: "350,00" envia saldoInicialCentavos: 35000, mensalidade vazia vai nula, e volta ao financeiro', async () => {
    const { chamadasA, local } = abrir(SEM_CONFIG, {
      [`PUT ${API}/config`]: () => json(200, CONFIG_SALVA),
    });
    fireEvent.change(await screen.findByLabelText(ROTULO_SALDO), { target: { value: '350,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(local()).toBe(BASE));
    expect(chamadasA('PUT', `${API}/config`)[0]?.corpo).toEqual({
      mensalidadeCentavos: null,
      saldoInicialCentavos: 35000,
      dataSaldoInicial: '2026-10-22',
    });
  });

  it('FIN-48: mensalidade "75" e saldo negativo "−15,00" vão em centavos inteiros', async () => {
    const { chamadasA } = abrir(SEM_CONFIG, {
      [`PUT ${API}/config`]: () => json(200, CONFIG_SALVA),
    });
    fireEvent.change(await screen.findByLabelText(ROTULO_MENSALIDADE), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText(ROTULO_SALDO), { target: { value: '−15,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadasA('PUT', `${API}/config`)).toHaveLength(1));
    expect(chamadasA('PUT', `${API}/config`)[0]?.corpo).toMatchObject({
      mensalidadeCentavos: 7500,
      saldoInicialCentavos: -1500,
    });
  });

  it('FIN-48: "35,0,0" mostra a mensagem no campo sem chamar a API', async () => {
    const { chamadasA } = abrir(SEM_CONFIG, {
      [`PUT ${API}/config`]: () => json(200, CONFIG_SALVA),
    });
    const saldo = await screen.findByLabelText(ROTULO_SALDO);
    fireEvent.change(saldo, { target: { value: '35,0,0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(MENSAGEM_REAIS)).toBeTruthy();
    expect(saldo.getAttribute('aria-invalid')).toBe('true');
    expect(saldo.closest('div')?.textContent).toContain(MENSAGEM_REAIS);
    expect(chamadasA('PUT', `${API}/config`)).toHaveLength(0);
  });

  it('FIN-48: mensalidade com texto inválido também marca o campo sem chamar a API', async () => {
    const { chamadasA } = abrir(SEM_CONFIG, {
      [`PUT ${API}/config`]: () => json(200, CONFIG_SALVA),
    });
    fireEvent.change(await screen.findByLabelText(ROTULO_MENSALIDADE), {
      target: { value: 'mil' },
    });
    fireEvent.change(screen.getByLabelText(ROTULO_SALDO), { target: { value: '350,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(MENSAGEM_REAIS)).toBeTruthy();
    expect(screen.getByLabelText(ROTULO_MENSALIDADE).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(ROTULO_SALDO).getAttribute('aria-invalid')).toBeNull();
    expect(chamadasA('PUT', `${API}/config`)).toHaveLength(0);
  });

  it('FIN-02, FIN-47: 422 de data futura mostra o resumo e a mensagem no campo da data; axe sem violação', async () => {
    const { container, local } = abrir(SEM_CONFIG, {
      [`PUT ${API}/config`]: () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['dataSaldoInicial'],
          mensagens: { dataSaldoInicial: MENSAGEM_FUTURO },
        }),
    });
    fireEvent.change(await screen.findByLabelText(ROTULO_SALDO), { target: { value: '350,00' } });
    fireEvent.change(screen.getByLabelText(ROTULO_DATA), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByRole('alert');
    expect(resumo.textContent).toContain('Corrija 1 campo:');
    expect(
      within(resumo)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Data do saldo inicial']);
    const data = screen.getByLabelText(ROTULO_DATA);
    expect(data.getAttribute('aria-invalid')).toBe('true');
    expect(data.closest('div')?.textContent).toContain(MENSAGEM_FUTURO);
    expect(local()).toBe(`${BASE}/config`);
    await esperarSemViolacoes(container);
  });
});
