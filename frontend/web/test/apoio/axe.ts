import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Axe sem violações (FUN-31) num trecho renderizado no jsdom. Duas regras ficam de fora, por
 * limite do jsdom e não do componente: `color-contrast` (o jsdom não calcula cor; o contraste
 * dos tokens está conferido no mockup) e `region` (o componente é testado fora da página).
 */
export async function esperarSemViolacoes(elemento: Element): Promise<void> {
  const r = await axe.run(elemento, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
