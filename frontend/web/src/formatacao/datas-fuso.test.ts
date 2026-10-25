// Critério: FUN-30 (componentes base: renderização e axe; CampoMoeda e NavegadorMes dependem desta formatação). Copiado do legado: frontend/web/src/formatacao/datas-fuso.test.ts

import { describe, expect, it } from 'vitest';

process.env.TZ = 'Asia/Tokyo';
const { dataCompleta, diaSemanaCurto, hora } = await import('./datas');

describe('independe do fuso do processo', () => {
  it('mesmos resultados com TZ=Asia/Tokyo', () => {
    expect(dataCompleta('2026-10-22')).toBe('22/10/2026');
    expect(diaSemanaCurto('2026-10-22')).toBe('qui, 22/10');
    expect(hora('2026-10-22T21:40:00Z')).toBe('18:40');
  });
});
