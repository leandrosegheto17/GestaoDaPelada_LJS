import { describe, expect, it } from 'vitest';
import { textoValidade } from '../../src/telas/plano/MeuPlano.tsx';

/** Texto de validade do plano em Meu plano (planos-e-cobranca A-14; PLA-52). */

describe('textoValidade', () => {
  it('PLA-52: trial mostra o último dia', () => {
    expect(
      textoValidade({ plano: 'trial', trialFimEm: '2026-11-14', pagoAte: null }, '2026-11-10'),
    ).toBe('Trial Pro até 14/11/2026');
  });

  it('PLA-52: Pro em dia mostra a data até onde está pago, inclusive no último dia', () => {
    const p = { plano: 'pro', trialFimEm: null, pagoAte: '2026-12-05' } as const;
    expect(textoValidade(p, '2026-11-20')).toBe('Pro até 05/12/2026');
    expect(textoValidade(p, '2026-12-05')).toBe('Pro até 05/12/2026');
  });

  it('A-14: Pro com o pagoAte já vencido não promete uma data passada', () => {
    const texto = textoValidade(
      { plano: 'pro', trialFimEm: null, pagoAte: '2026-12-05' },
      '2026-12-06',
    );
    expect(texto).toBe('Pro: renovação em andamento');
    expect(texto).not.toContain('05/12/2026');
  });

  it('PLA-52: Free e cortesia não têm validade', () => {
    expect(
      textoValidade({ plano: 'free', trialFimEm: null, pagoAte: null }, '2026-11-10'),
    ).toBeNull();
    expect(
      textoValidade({ plano: 'cortesia', trialFimEm: null, pagoAte: null }, '2026-11-10'),
    ).toBeNull();
  });
});
