const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Ordem alfabética sem acento nem caixa (GEL-47); o `id` desempata para a ordem ser sempre a mesma.
 * SPEC_DEVIATION: o design pede `compararApelido` de `@pelada/dominio`; o web não pode importar o domínio (G-01),
 * então a regra é repetida aqui, como no legado.
 */
export function compararApelido(a: { id: string; apelido: string }, b: { id: string; apelido: string }): number {
  return collator.compare(a.apelido, b.apelido) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Texto sem acento e em minúsculas, para a busca por trecho do apelido (GEL-48). */
export function chaveBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
