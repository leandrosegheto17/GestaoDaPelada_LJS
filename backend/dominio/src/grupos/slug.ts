/**
 * Base do slug do link público do grupo (GEL-11 a GEL-13). O slug nasce uma vez, na criação, e nunca muda (GEL-16).
 * O sufixo `-2`, `-3`… é escolhido no banco pela `grupo_criar`, que enxerga os slugs de todos os grupos (GEL-14).
 */
const LIMITE_BASE = 40;
const MINIMO_BASE = 3;
const PADRAO = 'grupo';

/** Palavras que colidiriam com rotas do app (GEL-13). */
export const SLUGS_RESERVADOS: readonly string[] = [
  'admin',
  'api',
  'dono',
  'entrar',
  'g',
  'privacidade',
  'conta',
  'assets',
  'well-known',
];

const RESERVADAS: ReadonlySet<string> = new Set(SLUGS_RESERVADOS);

/**
 * Sem acento, minúsculas, cada sequência fora de `a-z0-9` vira um hífen, sem hífen nas pontas, até 40 caracteres sem
 * hífen final. Base com menos de 3 caracteres vira `grupo` (GEL-12, avaliada antes da reservada, na ordem da spec);
 * reservada vira `<base>-grupo` (GEL-13).
 */
export function slugBase(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITE_BASE)
    .replace(/-+$/g, '');
  if (base.length < MINIMO_BASE) return PADRAO;
  return RESERVADAS.has(base) ? `${base}-${PADRAO}` : base;
}
