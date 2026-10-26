// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/basicos/Esqueleto.test.tsx

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Esqueleto } from './Esqueleto';

describe('Esqueleto', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nada em 299 ms, aparece em 300 ms', () => {
    const { container } = render(<Esqueleto variante="linha" quantidade={3} />);
    act(() => vi.advanceTimersByTime(299));
    expect(container.querySelectorAll('span')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('desmontar antes do atraso não deixa timer pendente', () => {
    const { unmount } = render(<Esqueleto />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('movimento reduzido', () => {
  it('global.css desliga animações com prefers-reduced-motion', () => {
    const global = readFileSync(join(import.meta.dirname, '../../estilos/global.css'), 'utf8');
    expect(global).toMatch(/prefers-reduced-motion:\s*reduce/);
    const modulo = readFileSync(join(import.meta.dirname, 'Esqueleto.module.css'), 'utf8');
    expect(modulo).not.toContain('!important');
  });
});
