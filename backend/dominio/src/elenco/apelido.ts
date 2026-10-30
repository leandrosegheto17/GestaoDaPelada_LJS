const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface ComApelido {
  id: string;
  apelido: string;
}

/** Ordem alfabética sem acento nem caixa; apelidos que só diferem por acento ou caixa dão 0 (GEL-47). */
export function compararApelidoBase(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Como `compararApelidoBase`, e o `id` desempata para a ordem ser sempre a mesma. */
export function compararApelido(a: ComApelido, b: ComApelido): number {
  return compararApelidoBase(a.apelido, b.apelido) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Texto sem acento e em minúsculas, para a busca por trecho do apelido (GEL-48). */
export function chaveBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
