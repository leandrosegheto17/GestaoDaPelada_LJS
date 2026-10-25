/** Lê o valor de um token de `tokens.css` (ex.: `--cor-verde`), sem repetir cores no código. */
export function lerToken(css: string, nome: string): string {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const achado = new RegExp(`${escapado}\\s*:\\s*([^;}]+)`).exec(semComentarios);
  if (!achado?.[1]) throw new Error(`Token não encontrado: ${nome}`);
  return achado[1].trim();
}
