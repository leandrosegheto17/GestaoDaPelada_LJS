import { describe, expect, it } from 'vitest';
import { asaasEventoCorpo } from '../src/asaas.ts';

/** Corpo tolerante do webhook (T7; PLA-41, PLA-50). */

const EVENTO = {
  id: 'evt_05b708f961d739ea7eba7e4db318f621&368604920',
  event: 'PAYMENT_RECEIVED',
  dateCreated: '2026-11-05 09:00:00',
  payment: {
    object: 'payment',
    id: 'pay_080225913252',
    customer: 'cus_000005219613',
    subscription: 'sub_VXJBYgP2u0eO',
    value: 9.9,
    netValue: 8.91,
    dueDate: '2026-11-05',
    status: 'RECEIVED',
    billingType: 'PIX',
    invoiceUrl: 'https://sandbox.asaas.com/i/080225913252',
  },
};

describe('asaasEventoCorpo', () => {
  it('PLA-50: corpo com campo novo no topo e dentro de payment é aceito e o campo some do resultado', () => {
    const r = asaasEventoCorpo.safeParse({
      ...EVENTO,
      campoNovoDoTopo: 'x',
      payment: { ...EVENTO.payment, campoNovoDoPagamento: { a: 1 } },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).not.toHaveProperty('campoNovoDoTopo');
    expect(r.data.payment).not.toHaveProperty('campoNovoDoPagamento');
    expect(r.data.payment).not.toHaveProperty('netValue');
    expect(r.data.payment).toEqual({
      id: 'pay_080225913252',
      subscription: 'sub_VXJBYgP2u0eO',
      value: 9.9,
      dueDate: '2026-11-05',
      status: 'RECEIVED',
      invoiceUrl: 'https://sandbox.asaas.com/i/080225913252',
    });
  });

  it('PLA-50: sem id é recusado', () => {
    const { id: _id, ...semId } = EVENTO;
    expect(asaasEventoCorpo.safeParse(semId).success).toBe(false);
    expect(asaasEventoCorpo.safeParse({ ...EVENTO, id: '' }).success).toBe(false);
  });

  it('PLA-50: sem event é recusado', () => {
    const { event: _event, ...semEvento } = EVENTO;
    expect(asaasEventoCorpo.safeParse(semEvento).success).toBe(false);
    expect(asaasEventoCorpo.safeParse({ ...EVENTO, event: 42 }).success).toBe(false);
  });

  it('PLA-50: só id e event bastam', () => {
    expect(asaasEventoCorpo.safeParse({ id: 'evt_1', event: 'SUBSCRIPTION_DELETED' }).success).toBe(
      true,
    );
  });

  it('PLA-50: campo conhecido com tipo inesperado vira null em vez de recusar', () => {
    const r = asaasEventoCorpo.safeParse({
      ...EVENTO,
      payment: { ...EVENTO.payment, value: '9.90' },
      subscription: 7,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.payment?.value).toBeNull();
    expect(r.data.subscription).toBeNull();
  });

  it('PLA-41, PLA-50: customer com e-mail não aparece no resultado', () => {
    const r = asaasEventoCorpo.safeParse({
      ...EVENTO,
      customer: { email: 'pessoa@exemplo.com', name: 'Pessoa', cpfCnpj: '52998224725' },
    });
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.data)).not.toContain('pessoa@exemplo.com');
    expect(JSON.stringify(r.data)).not.toContain('52998224725');
    expect(r.data).not.toHaveProperty('customer');
  });

  it('subscription com id é lida', () => {
    const r = asaasEventoCorpo.parse({
      id: 'evt_2',
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_1', x: 1 },
    });
    expect(r.subscription).toEqual({ id: 'sub_1' });
  });
});
