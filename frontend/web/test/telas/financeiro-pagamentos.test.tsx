import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  entradaDoPagamento,
  textoFalhaMarcar,
} from '../../src/telas/financeiro/ListaPagamentos.tsx';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Pagamentos do mês: marcar e desmarcar (financeiro T39; FIN-24), dentro da t22 com a resposta de outubro do mockup
 * (mensalidade R$ 75,00; Fumaça não pagou, Toninho pagou).
 */

const OUTUBRO = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../.specs/mockup/respostas/financeiro-2026-10.json'),
    'utf8',
  ),
) as { pagamentos: Array<{ jogadorId: string; apelido: string; pagou: boolean }> };

const CAMINHO = '/app/grupos/g-quinta/financeiro';
const API = '/api/grupos/g-quinta/financeiro';

function idDe(apelido: string): string {
  return OUTUBRO.pagamentos.find((p) => p.apelido === apelido)!.jogadorId;
}

function abrir(extras: Record<string, Manipulador> = {}) {
  return abrirTela(CAMINHO, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    [`GET ${API}/mes`]: () => json(200, OUTUBRO),
    ...extras,
  });
}

function interruptor(apelido: string): HTMLInputElement {
  return screen.getByRole('switch', { name: `Pagou: ${apelido}` }) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
});

describe('ListaPagamentos (FIN-24)', () => {
  it('FIN-24: cada ativo tem o interruptor no estado da API', async () => {
    abrir();
    await screen.findByRole('switch', { name: 'Pagou: Fumaça' });
    expect(interruptor('Fumaça').checked).toBe(false);
    expect(interruptor('Toninho').checked).toBe(true);
    expect(screen.getAllByRole('switch')).toHaveLength(OUTUBRO.pagamentos.length);
  });

  it('FIN-24: marcar muda na hora e chama o POST com o jogador e o mês', async () => {
    let soltar: (r: Response) => void = () => undefined;
    const { chamadasA } = abrir({
      [`POST ${API}/pagamentos`]: () => new Promise<Response>((r) => (soltar = r)),
    });
    await screen.findByRole('switch', { name: 'Pagou: Fumaça' });
    fireEvent.click(interruptor('Fumaça'));
    expect(interruptor('Fumaça').checked).toBe(true);
    await waitFor(() =>
      expect(chamadasA('POST', `${API}/pagamentos`)[0]?.corpo).toEqual({
        jogadorId: idDe('Fumaça'),
        mes: '2026-10',
      }),
    );
    soltar(json(204));
  });

  it('FIN-24: falha na marcação volta o item para "Não pagou" e mostra a mensagem', async () => {
    abrir({ [`POST ${API}/pagamentos`]: () => json(500, { erro: 'Erro interno.' }) });
    await screen.findByRole('switch', { name: 'Pagou: Fumaça' });
    fireEvent.click(interruptor('Fumaça'));
    expect(await screen.findByText(textoFalhaMarcar('Fumaça'))).toBeTruthy();
    expect(textoFalhaMarcar('Fumaça')).toBe(
      'Não foi possível marcar o pagamento de Fumaça. Tente de novo.',
    );
    await waitFor(() => expect(interruptor('Fumaça').checked).toBe(false));
  });

  it('FIN-47: a faixa de falha fica acima das duas colunas, fora da seção dos pagamentos (mockup t22 erro-pagamento)', async () => {
    abrir({ [`POST ${API}/pagamentos`]: () => json(500, { erro: 'Erro interno.' }) });
    await screen.findByRole('switch', { name: 'Pagou: Fumaça' });
    fireEvent.click(interruptor('Fumaça'));
    const faixa = await screen.findByText(textoFalhaMarcar('Fumaça'));
    expect(faixa.closest('section[aria-labelledby="pag"]')).toBeNull();
    expect(faixa.closest('[role="alert"], [class*="faixa"]')).not.toBeNull();
  });

  it('FIN-24: desmarcar mostra o texto exato do diálogo; cancelar não chama a API', async () => {
    const { chamadasA } = abrir({
      [`DELETE ${API}/pagamentos/${idDe('Toninho')}/2026-10`]: () => json(204),
    });
    await screen.findByRole('switch', { name: 'Pagou: Toninho' });
    fireEvent.click(interruptor('Toninho'));
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Desmarcar o pagamento de Toninho?',
    });
    expect(dialogo.textContent).toContain(
      'A entrada “Mensalidade Toninho 10/2026” (R$ 75,00) será removida do caixa.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(chamadasA('DELETE', `${API}/pagamentos/${idDe('Toninho')}/2026-10`)).toEqual([]);
    expect(interruptor('Toninho').checked).toBe(true);
  });

  it('FIN-22: confirmar o diálogo chama o DELETE do jogador e do mês', async () => {
    const { chamadasA } = abrir({
      [`DELETE ${API}/pagamentos/${idDe('Toninho')}/2026-10`]: () => json(204),
    });
    await screen.findByRole('switch', { name: 'Pagou: Toninho' });
    fireEvent.click(interruptor('Toninho'));
    fireEvent.click(await screen.findByRole('button', { name: 'Desmarcar' }));
    await waitFor(() =>
      expect(chamadasA('DELETE', `${API}/pagamentos/${idDe('Toninho')}/2026-10`)).toHaveLength(1),
    );
  });
});

describe('entradaDoPagamento', () => {
  const lancamentos = [
    {
      id: 'l-1',
      tipo: 'entrada' as const,
      data: '2026-10-03',
      descricao: 'Mensalidade Dudu 10/2026',
      valorCentavos: 7000,
      mensalidade: true,
    },
  ];

  it('usa o valor do lançamento da mensalidade quando ele está no mês (editado)', () => {
    expect(entradaDoPagamento('Dudu', '2026-10', lancamentos, 7500)).toEqual({
      descricao: 'Mensalidade Dudu 10/2026',
      valorCentavos: 7000,
    });
  });

  it('sem o lançamento no mês, a descrição padrão com a mensalidade configurada', () => {
    expect(entradaDoPagamento('Gordo', '2026-10', lancamentos, 7500)).toEqual({
      descricao: 'Mensalidade Gordo 10/2026',
      valorCentavos: 7500,
    });
  });

  it('sem lançamento e sem mensalidade, nulo', () => {
    expect(entradaDoPagamento('Gordo', '2026-10', [], null)).toBeNull();
  });
});
