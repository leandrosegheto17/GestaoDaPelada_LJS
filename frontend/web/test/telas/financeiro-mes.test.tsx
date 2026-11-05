import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TEXTO_SEM_ACESSO,
  TEXTO_SEM_ACESSO_AJUDA,
  TEXTO_SEM_CONFIG,
  TEXTO_SEM_LANCAMENTOS,
} from '../../src/telas/financeiro/FinanceiroMes.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Tela Financeiro do mês (financeiro T38; FIN-08, FIN-15, FIN-33, FIN-46), com as respostas do mockup
 * (`.specs/mockup/respostas/financeiro-2026-10.json`, `-2026-07.json`, `-sem-config.json`).
 */

function resposta(nome: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../.specs/mockup/respostas/${nome}`, import.meta.url)), 'utf8'));
}

const OUTUBRO = resposta('financeiro-2026-10.json') as { lancamentos: unknown[] };
const JULHO = resposta('financeiro-2026-07.json');
const SEM_CONFIG = resposta('financeiro-sem-config.json');

const CAMINHO = '/app/grupos/g-quinta/financeiro';
const API_MES = 'GET /api/grupos/g-quinta/financeiro/mes';

function abrir(mes: () => Response | Promise<Response>, caminho = CAMINHO) {
  return abrirTela(caminho, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    [API_MES]: mes,
  });
}

afterEach(() => {
  cleanup();
});

describe('Financeiro do mês (t22)', () => {
  it('FIN-15: com a resposta de outubro, os valores como no mockup', async () => {
    abrir(() => json(200, OUTUBRO));
    expect(await screen.findByText('R$ 1.245,50')).toBeTruthy();
    const grade = screen.getByText('Entradas no mês').closest('dl') as HTMLElement;
    expect(within(grade).getByText('R$ 1.200,00')).toBeTruthy();
    expect(within(grade).getByText('R$ 900,00')).toBeTruthy();
    expect(within(grade).getByText('R$ 300,00')).toBeTruthy();
    expect(within(grade).getByText('4 jogadores')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'outubro de 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pagamentos do mês · R$ 75,00' })).toBeTruthy();
  });

  it('FIN-15: as saídas levam "−" e a entrada não', async () => {
    abrir(() => json(200, OUTUBRO));
    expect(await screen.findByText('− R$ 800,00')).toBeTruthy();
    expect(screen.getByText('− R$ 100,00')).toBeTruthy();
    const aluguel = screen.getByText('Aluguel da quadra outubro').closest('a') as HTMLElement;
    expect(aluguel.getAttribute('href')).toMatch(/^\/app\/grupos\/g-quinta\/financeiro\/lancamentos\//);
    expect(aluguel.textContent).toContain('05/10 ·');
    expect(aluguel.textContent).toContain('Saída');
  });

  it('FIN-07: o mês seguinte fica desabilitado no mês de hoje; o anterior leva a ?mes=2026-09', async () => {
    const { local } = abrir(() => json(200, OUTUBRO));
    const anterior = await screen.findByRole('button', { name: 'Mês anterior, setembro de 2026' });
    expect((screen.getByRole('button', { name: 'Mês seguinte' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(anterior);
    await waitFor(() => expect(local()).toBe(`${CAMINHO}?mes=2026-09`));
  });

  it('FIN-07: ?mes=2026-07 pede o mês ao endereço e mostra os dois botões ativos', async () => {
    const { chamadasA } = abrir(() => json(200, JULHO), `${CAMINHO}?mes=2026-07`);
    expect(await screen.findByRole('heading', { name: 'julho de 2026' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Mês seguinte, agosto de 2026' }) as HTMLButtonElement).disabled).toBe(false);
    expect(chamadasA('GET', '/api/grupos/g-quinta/financeiro/mes')).toHaveLength(1);
  });

  it('mês sem lançamentos mostra "Nenhum lançamento neste mês."', async () => {
    abrir(() => json(200, { ...OUTUBRO, lancamentos: [] }));
    expect(await screen.findByText(TEXTO_SEM_LANCAMENTOS)).toBeTruthy();
  });

  it('FIN-08: sem configuração, "Caixa não configurado" e a ação Configurar caixa', async () => {
    abrir(() => json(200, SEM_CONFIG));
    expect(await screen.findByRole('heading', { name: TEXTO_SEM_CONFIG })).toBeTruthy();
    const acao = screen.getByRole('link', { name: 'Configurar caixa' });
    expect(acao.getAttribute('href')).toBe(`${CAMINHO}/config`);
    expect(screen.queryByText('Saldo atual')).toBeNull();
  });

  it('FIN-33: 403 mostra "Sem acesso" com Voltar para o início do grupo', async () => {
    abrir(() => json(403, { erro: TEXTO_SEM_ACESSO_AJUDA, codigo: 'sem_permissao_financeiro' }));
    expect(await screen.findByRole('heading', { name: TEXTO_SEM_ACESSO })).toBeTruthy();
    expect(screen.getByText(TEXTO_SEM_ACESSO_AJUDA)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar' }).getAttribute('href')).toBe('/app/grupos/g-quinta');
  });

  it('FIN-09: 422 do mês fora do histórico mostra a mensagem e o caminho ao mês atual', async () => {
    abrir(
      () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['mes'],
          mensagens: { mes: 'Mês fora do histórico do caixa.' },
        }),
      `${CAMINHO}?mes=2025-01`,
    );
    expect(await screen.findByText('Mês fora do histórico do caixa.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o mês atual' }).getAttribute('href')).toBe(CAMINHO);
  });

  it.each([
    ['sucesso', () => json(200, OUTUBRO), 'R$ 1.245,50'],
    ['vazio-config', () => json(200, SEM_CONFIG), TEXTO_SEM_CONFIG],
    ['vazio-mes', () => json(200, JULHO), 'julho de 2026'],
    ['sem-permissao', () => json(403, { erro: 'x', codigo: 'sem_permissao_financeiro' }), TEXTO_SEM_ACESSO],
  ])('FIN-46: axe sem violação no estado %s', async (_estado, mes, marca) => {
    const { container } = abrir(mes);
    await screen.findAllByText(marca);
    await esperarSemViolacoes(container);
  });
});
