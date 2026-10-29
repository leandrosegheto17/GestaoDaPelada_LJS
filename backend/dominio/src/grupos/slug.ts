/**
 * Base do slug do link público do grupo (GEL-11 a GEL-13). O slug é gerado uma vez na criação e nunca muda:
 * renomear o grupo não muda o link. O sufixo `-2`, `-3`… é escolhido no banco (`grupo_criar`), que vê os slugs
 * de todos os grupos.
 */
const LIMITE_BASE = 40;
const MINIMO_BASE = 3;
const PADRAO = 'grupo';

/** Palavras que colidiriam com rotas do app (GEL-13). */
const RESERVADAS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'dono',
  'entrar',
  'g',
  'privacidade',
  'conta',
  'assets',
  'well-known',
]);

/** Texto sem acento, minúsculo, só `[a-z0-9-]`, hífens únicos, sem hífen nas pontas e com até 40 caracteres. */
export function slugBase(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITE_BASE)
    .replace(/-+$/g, '');
  if (limpo.length < MINIMO_BASE) return PADRAO;
  return RESERVADAS.has(limpo) ? `${limpo}-${PADRAO}` : limpo;
}
