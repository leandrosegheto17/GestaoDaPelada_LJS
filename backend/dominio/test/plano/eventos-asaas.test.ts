import { describe, expect, it } from 'vitest';
import { efeitoDoEvento, type AssinaturaGravada, type EventoAsaas } from '../../src/plano/eventos-asaas.ts';

/**
 * Máquina de estado dos eventos do Asaas (T4; PLA-44 a PLA-49, PLA-51).
 *
 * Casos limite listados antes do código: cada evento tratado × `aguardando_pagamento`, `ativa`, `cancelada`; evento mais
 * antigo que o último aplicado; valor divergente; `PAYMENT_OVERDUE` de cobrança que não é a mais recente; estorno de
 * cobrança que não deu o Pro.
 */

const AGUARDANDO: AssinaturaGravada = {
  situacao: 'aguardando_pagamento',
  valorCentavos: 990,
  pagoAte: null,
  cobrancaDoPro: null,
  ultimoEventoEm: null,
};

const ATIVA: AssinaturaGravada = {
  situacao: 'ativa',
  valorCentavos: 990,
  pagoAte: '2026-12-04',
  cobrancaDoPro: 'pay_1',
  ultimoEventoEm: '2026-11-04 10:00:00',
};

const CANCELADA: AssinaturaGravada = { ...ATIVA, situacao: 'cancelada' };

function evento(tipo: string, extra: Partial<EventoAsaas> = {}): EventoAsaas {
  return {
    evento: tipo,
    dataCriacao: '2026-11-05 09:00:00',
    cobranca: { id: 'pay_1', valorReais: 9.9, vencimento: '2026-11-04' },
    ...extra,
  };
}

describe('efeitoDoEvento: pagamento', () => {
  it.each(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])(
    'PLA-44: %s com valor igual em aguardando_pagamento → ativar com pagoAteDe(dueDate)',
    (tipo) => {
      expect(efeitoDoEvento(evento(tipo), AGUARDANDO)).toEqual({
        tipo: 'ativar',
        pagoAte: '2026-12-04',
        cobrancaId: 'pay_1',
      });
    },
  );

  it('PLA-44: pagamento da cobrança do mês seguinte numa assinatura ativa estende o pagoAte', () => {
    const e = evento('PAYMENT_RECEIVED', {
      dataCriacao: '2026-12-04 08:00:00',
      cobranca: { id: 'pay_2', valorReais: 9.9, vencimento: '2026-12-04' },
    });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'ativar', pagoAte: '2027-01-04', cobrancaId: 'pay_2' });
  });

  it('PLA-44: pagamento atrasado volta de inadimplente (assinatura segue ativa, AD-096)', () => {
    const e = evento('PAYMENT_RECEIVED', {
      dataCriacao: '2026-12-10 08:00:00',
      cobranca: { id: 'pay_2', valorReais: 9.9, vencimento: '2026-12-04' },
    });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'ativar', pagoAte: '2027-01-04', cobrancaId: 'pay_2' });
  });

  it('PLA-44: CONFIRMED e depois RECEIVED da mesma cobrança não aplicam duas vezes', () => {
    expect(efeitoDoEvento(evento('PAYMENT_RECEIVED'), ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'ja_aplicado' });
  });

  it('PLA-51: valor divergente não ativa', () => {
    const e = evento('PAYMENT_RECEIVED', { cobranca: { id: 'pay_1', valorReais: 5, vencimento: '2026-11-04' } });
    expect(efeitoDoEvento(e, AGUARDANDO)).toEqual({ tipo: 'nenhum', motivo: 'valor_divergente' });
  });

  it('PLA-51: valor ausente ou com mais de 2 casas conta como divergente', () => {
    const semValor = evento('PAYMENT_CONFIRMED', { cobranca: { id: 'pay_1', valorReais: null, vencimento: '2026-11-04' } });
    const tresCasas = evento('PAYMENT_CONFIRMED', { cobranca: { id: 'pay_1', valorReais: 9.901, vencimento: '2026-11-04' } });
    expect(efeitoDoEvento(semValor, AGUARDANDO)).toEqual({ tipo: 'nenhum', motivo: 'valor_divergente' });
    expect(efeitoDoEvento(tresCasas, AGUARDANDO)).toEqual({ tipo: 'nenhum', motivo: 'valor_divergente' });
  });

  it('PLA-44: pagamento sem cobrança ou sem vencimento não ativa', () => {
    expect(efeitoDoEvento(evento('PAYMENT_RECEIVED', { cobranca: null }), AGUARDANDO)).toEqual({
      tipo: 'nenhum',
      motivo: 'incompleto',
    });
    const semVencimento = evento('PAYMENT_RECEIVED', { cobranca: { id: 'pay_1', valorReais: 9.9, vencimento: null } });
    expect(efeitoDoEvento(semVencimento, AGUARDANDO)).toEqual({ tipo: 'nenhum', motivo: 'incompleto' });
  });

  it('pagamento de assinatura cancelada não reativa (lacuna, conservador)', () => {
    const e = evento('PAYMENT_RECEIVED', {
      dataCriacao: '2026-12-04 08:00:00',
      cobranca: { id: 'pay_2', valorReais: 9.9, vencimento: '2026-12-04' },
    });
    expect(efeitoDoEvento(e, CANCELADA)).toEqual({ tipo: 'nenhum', motivo: 'assinatura_cancelada' });
  });
});

describe('efeitoDoEvento: atraso', () => {
  const atraso = evento('PAYMENT_OVERDUE', {
    dataCriacao: '2026-12-05 00:10:00',
    cobranca: { id: 'pay_2', valorReais: 9.9, vencimento: '2026-12-04' },
  });

  it('PLA-45: PAYMENT_OVERDUE da cobrança mais recente de assinatura ativa → inadimplente', () => {
    expect(efeitoDoEvento(atraso, ATIVA)).toEqual({ tipo: 'inadimplente' });
  });

  it('PLA-45: PAYMENT_OVERDUE em aguardando_pagamento → nenhum', () => {
    expect(efeitoDoEvento(atraso, AGUARDANDO).tipo).toBe('nenhum');
  });

  it('PLA-45: PAYMENT_OVERDUE de cobrança antiga, já superada pelo pagoAte, → nenhum', () => {
    const antiga = evento('PAYMENT_OVERDUE', {
      dataCriacao: '2026-12-05 00:10:00',
      cobranca: { id: 'pay_0', valorReais: 9.9, vencimento: '2026-10-04' },
    });
    expect(efeitoDoEvento(antiga, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'outra_cobranca' });
  });

  it('PLA-45: PAYMENT_OVERDUE de assinatura cancelada → nenhum', () => {
    expect(efeitoDoEvento(atraso, CANCELADA).tipo).toBe('nenhum');
  });
});

describe('efeitoDoEvento: cancelamento', () => {
  it.each(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])('PLA-46: %s → cancelar', (tipo) => {
    expect(efeitoDoEvento(evento(tipo, { cobranca: null }), ATIVA)).toEqual({ tipo: 'cancelar' });
    expect(efeitoDoEvento(evento(tipo, { cobranca: null }), AGUARDANDO)).toEqual({ tipo: 'cancelar' });
  });

  it('PLA-46: assinatura já cancelada não cancela de novo', () => {
    expect(efeitoDoEvento(evento('SUBSCRIPTION_DELETED', { cobranca: null }), CANCELADA)).toEqual({
      tipo: 'nenhum',
      motivo: 'ja_aplicado',
    });
  });
});

describe('efeitoDoEvento: estorno', () => {
  it.each(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])(
    'PLA-47: %s da cobrança do Pro atual → inadimplente',
    (tipo) => {
      expect(efeitoDoEvento(evento(tipo), ATIVA)).toEqual({ tipo: 'inadimplente' });
    },
  );

  it.each(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'])('PLA-47: %s de outra cobrança → nenhum', (tipo) => {
    const e = evento(tipo, { cobranca: { id: 'pay_0', valorReais: 9.9, vencimento: '2026-10-04' } });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'outra_cobranca' });
  });

  it('PLA-47: estorno em aguardando_pagamento (sem cobrança do Pro) → nenhum', () => {
    expect(efeitoDoEvento(evento('PAYMENT_REFUNDED'), AGUARDANDO).tipo).toBe('nenhum');
  });
});

describe('efeitoDoEvento: ordem e tipos', () => {
  it('PLA-48: PAYMENT_CREATED com dateCreated anterior a um PAYMENT_RECEIVED aplicado → fora_de_ordem', () => {
    const e = evento('PAYMENT_CREATED', { dataCriacao: '2026-11-04 09:00:00' });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'fora_de_ordem' });
  });

  it('PLA-48: OVERDUE com dateCreated anterior ao último aplicado não regride o Pro', () => {
    const e = evento('PAYMENT_OVERDUE', {
      dataCriacao: '2026-11-04 09:59:59',
      cobranca: { id: 'pay_2', valorReais: 9.9, vencimento: '2026-12-04' },
    });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'fora_de_ordem' });
  });

  it('PLA-48: SUBSCRIPTION_DELETED mais antigo que o último aplicado não cancela', () => {
    const e = evento('SUBSCRIPTION_DELETED', { dataCriacao: '2026-11-01 00:00:00', cobranca: null });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'fora_de_ordem' });
  });

  it('PLA-48: mesma dateCreated do último aplicado ainda aplica', () => {
    const e = evento('SUBSCRIPTION_DELETED', { dataCriacao: '2026-11-04 10:00:00', cobranca: null });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'cancelar' });
  });

  it('PLA-48: sem dateCreated e com evento já aplicado não aplica', () => {
    const e = evento('SUBSCRIPTION_DELETED', { dataCriacao: null, cobranca: null });
    expect(efeitoDoEvento(e, ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'fora_de_ordem' });
  });

  it.each(['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'SUBSCRIPTION_CREATED', 'EVENTO_NOVO_DO_ASAAS', ''])(
    'PLA-49: tipo %s → nao_tratado',
    (tipo) => {
      expect(efeitoDoEvento(evento(tipo), AGUARDANDO)).toEqual({ tipo: 'nenhum', motivo: 'nao_tratado' });
      expect(efeitoDoEvento(evento(tipo), ATIVA)).toEqual({ tipo: 'nenhum', motivo: 'nao_tratado' });
    },
  );
});
