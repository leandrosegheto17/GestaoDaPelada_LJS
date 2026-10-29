// Critério: GEL-36 (ano de nascimento até o ano de hoje − 10; o limite acompanha a virada do ano).
import { describe, expect, it } from 'vitest';
import { anoNascimentoMaximo } from '../../src/index.ts';

describe('anoNascimentoMaximo (GEL-36)', () => {
  it('em 2026-10-29 o máximo é 2016', () => {
    expect(anoNascimentoMaximo('2026-10-29')).toBe(2016);
  });

  it('acompanha a virada do ano: 2026-12-31 → 2016 e 2027-01-01 → 2017', () => {
    expect(anoNascimentoMaximo('2026-12-31')).toBe(2016);
    expect(anoNascimentoMaximo('2027-01-01')).toBe(2017);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-10-29T10:00', '29/10/2026', '', 'hoje'])(
    'data inválida %j é recusada com erro claro',
    (hoje) => {
      expect(() => anoNascimentoMaximo(hoje)).toThrow(RangeError);
      expect(() => anoNascimentoMaximo(hoje)).toThrow(/Data inválida.*AAAA-MM-DD/);
    },
  );
});
