/** O que a API devolve em `campos` no 422: a primeira mensagem de cada campo (como em `entrada/corpo.ts`). */
export function camposDe(
  schema: {
    safeParse(v: unknown): {
      success: boolean;
      error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
    };
  },
  valor: unknown,
): Record<string, string> {
  const r = schema.safeParse(valor);
  const campos: Record<string, string> = {};
  for (const problema of r.error?.issues ?? []) {
    const campo = problema.path.map(String).join('.') || 'corpo';
    campos[campo] ??= problema.message;
  }
  return campos;
}

/** Cópia do objeto sem um campo. */
export const sem = (objeto: object, campo: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(objeto).filter(([chave]) => chave !== campo));
