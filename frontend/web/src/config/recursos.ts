/**
 * Recursos de incrementos futuros já desenhados no mockup: ficam atrás desta chave e só
 * aparecem quando o incremento entra no ar. `VITE_RECURSOS_DESLIGADOS` lista os desligados,
 * separados por vírgula; vazio ou ausente = tudo ligado.
 */
export const RECURSOS = ['simulador', 'pdf', 'financeiro', 'privacidade'] as const;
export type Recurso = (typeof RECURSOS)[number];

/** Lê a lista de recursos desligados. Nome desconhecido ou item vazio entre vírgulas é erro (falha fechada). */
export function lerRecursosDesligados(texto: string | undefined): ReadonlySet<Recurso> {
  const limpo = (texto ?? '').trim();
  if (limpo === '') return new Set();
  const desligados = new Set<Recurso>();
  for (const bruto of limpo.split(',')) {
    const nome = bruto.trim();
    const conhecido = RECURSOS.find((r) => r === nome);
    if (!conhecido) throw new Error(`Recurso desconhecido em VITE_RECURSOS_DESLIGADOS: "${nome}"`);
    desligados.add(conhecido);
  }
  return desligados;
}

let desligados: ReadonlySet<Recurso> | null = null;

export const recursos = {
  /** O recurso está ligado neste build? */
  ligado(nome: Recurso): boolean {
    desligados ??= lerRecursosDesligados(import.meta.env.VITE_RECURSOS_DESLIGADOS);
    return !desligados.has(nome);
  },
};
