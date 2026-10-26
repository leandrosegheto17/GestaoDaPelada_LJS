import ts from 'typescript';

/** Lê um wrangler.jsonc (JSON com comentários) com o parser do TypeScript; lança se o texto não for JSONC. */
export function lerWranglerJsonc(texto: string): Record<string, unknown> {
  if (texto.trim() === '') throw new Error('wrangler.jsonc vazio');
  const { config, error } = ts.parseConfigFileTextToJson('wrangler.jsonc', texto);
  if (error || typeof config !== 'object' || config === null) throw new Error('wrangler.jsonc inválido');
  return config as Record<string, unknown>;
}

/** Id do primeiro binding de Hyperdrive da raiz do wrangler.jsonc (32 hex minúsculos); lança se não houver ou se o formato não casar. */
export function idDoHyperdrive(texto: string): string {
  const { hyperdrive } = lerWranglerJsonc(texto) as { hyperdrive?: { id?: unknown }[] };
  const id = hyperdrive?.[0]?.id;
  if (typeof id !== 'string' || id === '') throw new Error('wrangler.jsonc sem hyperdrive[0].id');
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('hyperdrive[0].id fora do formato (32 hex minúsculos)');
  return id;
}
