import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeuPlano } from '../../src/telas/plano/MeuPlano.tsx';
import { abrirTela, json, type Manipulador } from '../apoio/tela.tsx';

/** Meu plano: assinar com nome e CPF (planos-e-cobranca T45; PLA-53, PLA-34, PLA-35, PLA-36). */

const PLANO = {
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
const FATURA = 'https://sandbox.asaas.com/i/pay_000001';
const MENSAGEM_502 =
  'Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.';

let abrir: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montar(post: Manipulador) {
  return abrirTela(
    '/app/grupos/g1/plano',
    {
      'GET /api/grupos/g1/plano': () => json(200, PLANO),
      'POST /api/grupos/g1/assinatura': post,
    },
    () => [{ path: '/app/grupos/:grupoId/plano', element: <MeuPlano /> }],
  );
}

async function preencher(nome: string, cpf: string) {
  fireEvent.change(await screen.findByLabelText('Nome completo'), { target: { value: nome } });
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: cpf } });
  fireEvent.click(screen.getByRole('button', { name: 'Assinar Pro' }));
}

describe('Assinar Pro', () => {
  it('PLA-53: mostra "Assinar Pro: R$ 9,90/mês" para a criadora sem assinatura', async () => {
    montar(() => json(201, { faturaUrl: FATURA }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Assinar Pro: R$ 9,90/mês' }),
    ).toBeDefined();
  });

  it('PLA-53: envio com sucesso manda nome e CPF e chama window.open com a faturaUrl', async () => {
    const { chamadasA } = montar(() => json(201, { faturaUrl: FATURA }));
    await preencher('Maria Silva', '529.982.247-25');
    await waitFor(() => expect(abrir).toHaveBeenCalledWith(FATURA, '_blank', 'noopener'));
    expect(chamadasA('POST', '/api/grupos/g1/assinatura')[0]?.corpo).toEqual({
      nome: 'Maria Silva',
      cpf: '52998224725',
    });
  });

  it('PLA-35: CPF inválido mostra o erro no campo sem chamar a API', async () => {
    const { chamadasA } = montar(() => json(201, { faturaUrl: FATURA }));
    await preencher('Maria Silva', '111.111.111-11');
    const cpf = await screen.findByLabelText('CPF');
    await waitFor(() => expect(cpf.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('CPF inválido.')).toBeDefined();
    expect(chamadasA('POST', '/api/grupos/g1/assinatura')).toHaveLength(0);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('PLA-36: 502 mostra a mensagem da API e "Tentar de novo" reenvia', async () => {
    let vez = 0;
    const { chamadasA } = montar(() => {
      vez += 1;
      return vez === 1
        ? json(502, { erro: 'pagamento_indisponivel', mensagem: MENSAGEM_502 })
        : json(201, { faturaUrl: FATURA });
    });
    await preencher('Maria Silva', '529.982.247-25');
    expect(await screen.findByText(MENSAGEM_502)).toBeDefined();
    expect(abrir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(abrir).toHaveBeenCalledWith(FATURA, '_blank', 'noopener'));
    expect(chamadasA('POST', '/api/grupos/g1/assinatura')).toHaveLength(2);
  });

  it('PLA-34: o formulário não tem campo de cartão', async () => {
    const { container } = montar(() => json(201, { faturaUrl: FATURA }));
    await screen.findByLabelText('CPF');
    const campos = Array.from(container.querySelectorAll('form input')).map(
      (i) =>
        `${i.getAttribute('id')} ${i.getAttribute('autocomplete') ?? ''} ${i.getAttribute('name') ?? ''}`,
    );
    expect(campos).toHaveLength(2);
    expect(campos.join(' ')).not.toMatch(/cc-|cart|card|validade|cvv/i);
  });
});
