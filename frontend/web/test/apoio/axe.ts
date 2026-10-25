import axe from 'axe-core';

/** Roda o axe no elemento e devolve as violações (lista vazia = acessível). */
export async function violacoes(elemento: Element): Promise<string[]> {
  const resultado = await axe.run(elemento, { rules: { 'color-contrast': { enabled: false } } });
  return resultado.violations.map((v) => `${v.id}: ${v.help}`);
}
