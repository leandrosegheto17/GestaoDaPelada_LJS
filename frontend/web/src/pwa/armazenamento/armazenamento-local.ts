/**
 * Armazenamento do aparelho (partidas-e-ranking T67, T72; PAR-123, PAR-154; P23 de `BC:35`): `localStorage` síncrono,
 * no molde da dispensa do aviso de instalação (`pwa/useModoInstalacao.ts:44`). O aparelho guarda só:
 * - o identificador anônimo (`CHAVE_DISPOSITIVO`), um UUID v4 sem relação com a pessoa (PAR-123);
 * - o último ranking público por slug e mês (`pwa/armazenamento/ranking-guardado.ts`, T72);
 * - a marca do aviso de instalação (`CHAVE_DISPENSA`, FUN-36).
 *
 * O armazenamento pode faltar ou lançar (aba privada): leitura vira `null`, gravação é ignorada, e o identificador
 * passa a valer só até recarregar a página.
 */

export const CHAVE_DISPOSITIVO = 'pelada:dispositivo';

/** UUID v4 (o formato que o `eventoPublicoCorpo` aceita). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function lerLocal(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarLocal(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento (aba privada, cota cheia): segue sem guardar.
  }
}

export function removerLocal(chave: string): void {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Idem.
  }
}

/** As chaves guardadas hoje (para o teste do PAR-154 e a limpeza de chaves inválidas). */
export function chavesLocais(): string[] {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const chave = window.localStorage.key(i);
      if (chave !== null) chaves.push(chave);
    }
    return chaves;
  } catch {
    return [];
  }
}

/** Identificador desta página quando o armazenamento falha: um só por carregamento. */
let semArmazenamento: string | null = null;

/**
 * Identificador anônimo do aparelho (PAR-123): o guardado, se for UUID v4; senão, um novo de `crypto.randomUUID()`,
 * guardado para as próximas aberturas.
 */
export function idDoAparelho(): string {
  const guardado = lerLocal(CHAVE_DISPOSITIVO);
  if (guardado !== null && UUID_V4.test(guardado)) return guardado;
  const novo = crypto.randomUUID();
  gravarLocal(CHAVE_DISPOSITIVO, novo);
  if (lerLocal(CHAVE_DISPOSITIVO) === novo) return novo;
  semArmazenamento ??= novo;
  return semArmazenamento;
}
