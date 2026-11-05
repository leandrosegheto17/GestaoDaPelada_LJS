/**
 * Apelido do jogador: chave de busca e ordem sem acento e sem caixa (GEL-47, GEL-48), e a data das mensagens em
 * `dd/mm/aaaa`. A unicidade do apelido no grupo é outra regra (sem caixa, mas com acento, GEL-35): fica no banco
 * (`jogadores_apelido_grupo`).
 */

/** Texto sem acento e em minúsculas, para busca e ordem. */
export function chaveBusca(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Ordem pelo apelido sem acento e sem caixa; empate desfeito pelo texto original, para a ordem ser estável. */
export function compararApelido(a: string, b: string): number {
  const ca = chaveBusca(a);
  const cb = chaveBusca(b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. Recebe só datas já validadas. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}
