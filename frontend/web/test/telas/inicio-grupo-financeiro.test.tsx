import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InicioGrupo, TEXTO_CAIXA_NAO_CONFIGURADO, textoSaldo } from '../../src/telas/grupo/InicioGrupo.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Cartão Financeiro no início do grupo (financeiro T43; FIN-34, FIN-46, AD-079), de
 * `.specs/mockup/telas/t09-inicio--sucesso.html:21`. Molde: `inicio-grupo.test.tsx`.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId', element: <InicioGrupo /> },
  { path: '*', element: <p>destino</p> },
];

const QUINTA = {
  id: 'g-quinta',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 1,
  souCriador: true,
  // Campos do início (PAR-132) e do simulador (SIM-08) da forma do GET (partidas-e-ranking T64): só preparação.
  dataSugeridaPartida: '2026-10-22',
  partidaNaDataSugerida: false,
  partidasNoMes: 3,
  pesosVigentesDesde: '2026-09-01',
  pesosPadrao: false,
  aparelhosNaSemana: 12,
  proximoDiaDeJogo: '2026-10-22',
  escalacaoNoProximoDia: false,
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela('/app/grupos/g-quinta', { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

afterEach(() => {
  cleanup();
});

describe('textoSaldo', () => {
  it('FIN-34: saldo em reais, negativo com "−" e nulo como caixa não configurado', () => {
    expect(textoSaldo(124550)).toBe('Saldo R$ 1.245,50');
    expect(textoSaldo(-90000)).toBe('Saldo − R$ 900,00');
    expect(textoSaldo(0)).toBe('Saldo R$ 0,00');
    expect(textoSaldo(null)).toBe(TEXTO_CAIXA_NAO_CONFIGURADO);
  });
});

describe('item Financeiro no início (t09)', () => {
  it('FIN-34: com saldo 124550, item "Financeiro" com "Saldo R$ 1.245,50" e link para o financeiro; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, saldoFinanceiroCentavos: 124550 }) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    const item = within(lista).getByRole('link', { name: /Financeiro/ });
    expect(item.textContent).toBe('FinanceiroSaldo R$ 1.245,50');
    expect(item.getAttribute('href')).toBe('/app/grupos/g-quinta/financeiro');
    // O último item, depois de Dados do grupo, como no mockup.
    expect(within(lista).getAllByRole('link').at(-1)).toBe(item);
    await esperarSemViolacoes(container);
  });

  it('FIN-34: saldo nulo (caixa sem configuração) mostra "Caixa não configurado"', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, saldoFinanceiroCentavos: null }) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByRole('link', { name: /Financeiro/ }).textContent).toBe(`Financeiro${TEXTO_CAIXA_NAO_CONFIGURADO}`);
  });

  it('FIN-34: sem a chave saldoFinanceiroCentavos, nenhum item Financeiro', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).queryByText('Financeiro')).toBeNull();
    // partidas-e-ranking T64 (autorização de 2026-11-04 da financeiro no STATE.md): os 7 itens do mockup do módulo,
    // nenhum deles Financeiro.
    expect(within(lista).getAllByRole('link')).toHaveLength(7);
    expect(within(lista).getAllByRole('link').map((a) => a.textContent)).not.toContain(expect.stringMatching(/^Financeiro/));
  });
});
