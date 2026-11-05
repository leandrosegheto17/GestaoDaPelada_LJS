import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_AGUARDANDO } from '../../src/telas/plano/AssinaturaAtual.tsx';
import { MeuPlano } from '../../src/telas/plano/MeuPlano.tsx';
import { abrirTela, json, type Manipulador } from '../apoio/tela.tsx';

/** Meu plano: aguardando e cancelar (planos-e-cobranca T46; PLA-54, PLA-55, PLA-56; AD-115). */

const FATURA = 'https://sandbox.asaas.com/i/pay_000002';
const MENSAGEM_502 = 'Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.';
const BASE = {
  plano: 'trial',
  situacao: 'trial',
  trialFimEm: '2026-11-14',
  pagoAte: null,
  jogadoresAtivos: 12,
  limiteJogadores: null,
  somenteLeitura: null,
  recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
  podeAssinar: true,
  assinatura: null,
};
const PENDENTE = { ...BASE, assinatura: { situacao: 'aguardando_pagamento', faturaUrl: FATURA } };
const ATIVA = {
  ...BASE,
  plano: 'pro',
  situacao: 'ativo',
  trialFimEm: null,
  pagoAte: '2026-12-05',
  assinatura: { situacao: 'ativa', faturaUrl: null },
};

afterEach(() => {
  cleanup();
});

function montar(api: Record<string, Manipulador>) {
  return abrirTela('/app/grupos/g1/plano', api, () => [
    { path: '/app/grupos/:grupoId/plano', element: <MeuPlano /> },
  ]);
}

describe('Assinatura atual', () => {
  it('PLA-54: pendente mostra "Aguardando a confirmação do pagamento" e o link da fatura, sem o formulário', async () => {
    montar({ 'GET /api/grupos/g1/plano': () => json(200, PENDENTE) });
    expect(await screen.findByText(TEXTO_AGUARDANDO, { exact: false })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir a fatura' }).getAttribute('href')).toBe(FATURA);
    expect(screen.queryByLabelText('CPF')).toBeNull();
  });

  it('PLA-54: reabrir com o grupo ativo mostra Pro, sem o aguardando', async () => {
    const primeira = montar({ 'GET /api/grupos/g1/plano': () => json(200, PENDENTE) });
    await screen.findByText(TEXTO_AGUARDANDO, { exact: false });
    primeira.unmount();
    montar({ 'GET /api/grupos/g1/plano': () => json(200, ATIVA) });
    expect(await screen.findByRole('heading', { level: 2, name: 'Pro' })).toBeDefined();
    expect(screen.queryByText(TEXTO_AGUARDANDO, { exact: false })).toBeNull();
  });

  it('PLA-54: grupo inadimplente com a fatura em aberto também mostra o aguardando e o link (AD-096)', async () => {
    montar({
      'GET /api/grupos/g1/plano': () =>
        json(200, {
          ...ATIVA,
          plano: 'free',
          situacao: 'inadimplente',
          limiteJogadores: 20,
          recursos: ['partidas', 'ranking'],
          assinatura: { situacao: 'ativa', faturaUrl: FATURA },
        }),
    });
    expect(await screen.findByText(TEXTO_AGUARDANDO, { exact: false })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir a fatura' }).getAttribute('href')).toBe(FATURA);
  });

  it('PLA-55: o diálogo mostra a data de pagoAte e, confirmado, chama o DELETE', async () => {
    const { chamadasA } = montar({
      'GET /api/grupos/g1/plano': () => json(200, ATIVA),
      'DELETE /api/grupos/g1/assinatura': () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('O grupo continua Pro até 05/12/2026');
    expect(chamadasA('DELETE', '/api/grupos/g1/assinatura')).toHaveLength(0);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar assinatura' }));
    await waitFor(() => expect(chamadasA('DELETE', '/api/grupos/g1/assinatura')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('PLA-55: voltar no diálogo não chama o DELETE', async () => {
    const { chamadasA } = montar({
      'GET /api/grupos/g1/plano': () => json(200, ATIVA),
      'DELETE /api/grupos/g1/assinatura': () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('DELETE', '/api/grupos/g1/assinatura')).toHaveLength(0);
  });

  it('PLA-55: no estado pendente, "Cancelar assinatura" aparece e chama o DELETE (AD-115)', async () => {
    const { chamadasA } = montar({
      'GET /api/grupos/g1/plano': () => json(200, PENDENTE),
      'DELETE /api/grupos/g1/assinatura': () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('A fatura em aberto deixa de valer.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar assinatura' }));
    await waitFor(() => expect(chamadasA('DELETE', '/api/grupos/g1/assinatura')).toHaveLength(1));
  });

  it('PLA-56: 502 no cancelamento mostra o erro e o plano segue Pro', async () => {
    montar({
      'GET /api/grupos/g1/plano': () => json(200, ATIVA),
      'DELETE /api/grupos/g1/assinatura': () =>
        json(502, { erro: 'pagamento_indisponivel', mensagem: MENSAGEM_502 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancelar assinatura',
      }),
    );
    expect(await screen.findByText(MENSAGEM_502)).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Pro' })).toBeDefined();
  });

  it('PLA-57: admin convidada não vê o cancelar', async () => {
    montar({ 'GET /api/grupos/g1/plano': () => json(200, { ...ATIVA, podeAssinar: false }) });
    await screen.findByRole('heading', { level: 2, name: 'Pro' });
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).toBeNull();
  });
});
