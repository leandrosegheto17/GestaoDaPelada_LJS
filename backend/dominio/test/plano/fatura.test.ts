import { describe, expect, it } from 'vitest';
import { mostraFaturaEmAberto } from '../../src/plano/fatura.ts';
import { SITUACOES_COMERCIAIS } from '../../src/plano/plano-efetivo.ts';

/** Fatura em aberto em Meu plano (T24; PLA-08, PLA-54; AD-096): cada situação do grupo × cada situação da assinatura. */

describe('mostraFaturaEmAberto', () => {
  it.each(SITUACOES_COMERCIAIS)(
    'PLA-54: aguardando_pagamento mostra a fatura com o grupo em %s',
    (situacao) => {
      expect(mostraFaturaEmAberto(situacao, 'aguardando_pagamento')).toBe(true);
    },
  );

  it('PLA-08: assinatura ativa com o grupo inadimplente mostra a fatura (AD-096)', () => {
    expect(mostraFaturaEmAberto('inadimplente', 'ativa')).toBe(true);
  });

  it.each(['uso_proprio', 'trial', 'ativo', 'cancelado'] as const)(
    'PLA-08: assinatura ativa com o grupo em %s não mostra',
    (situacao) => {
      expect(mostraFaturaEmAberto(situacao, 'ativa')).toBe(false);
    },
  );

  it.each(SITUACOES_COMERCIAIS)(
    'PLA-08: assinatura cancelada nunca mostra (grupo em %s)',
    (situacao) => {
      expect(mostraFaturaEmAberto(situacao, 'cancelada')).toBe(false);
    },
  );

  it.each(SITUACOES_COMERCIAIS)('PLA-08: sem assinatura não mostra (grupo em %s)', (situacao) => {
    expect(mostraFaturaEmAberto(situacao, null)).toBe(false);
  });
});
