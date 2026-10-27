import type { Context } from 'hono';
import { CODIGOS_ERRO, erroComStatus } from './erros.ts';

interface Problema {
  path: readonly PropertyKey[];
  message: string;
}

/** O que o `safeParse` dos schemas do contrato (zod) devolve, no que a API precisa. */
interface Esquema<T> {
  safeParse(valor: unknown): { success: true; data: T } | { success: false; error: { issues: readonly Problema[] } };
}

export type CorpoLido<T> = { ok: true; dado: T } | { ok: false; resposta: Response };

const MENSAGEM_TERMOS = 'É preciso aceitar os termos.';

/**
 * Lê o JSON do pedido e valida com o schema do contrato. Falha vira 422 `dados_invalidos` com a mensagem por campo
 * (nunca o valor recebido, que pode ser senha); só o aceite dos termos faltando vira `termos_obrigatorios`
 * (ACE-02, ACE-03).
 */
export async function lerCorpo<T>(c: Context, schema: Esquema<T>): Promise<CorpoLido<T>> {
  let bruto: unknown;
  try {
    bruto = await c.req.json();
  } catch {
    return {
      ok: false,
      resposta: erroComStatus(c, 422, CODIGOS_ERRO.dadosInvalidos, 'Corrija os campos indicados.', {
        corpo: 'Envie um JSON válido.',
      }),
    };
  }
  const resultado = schema.safeParse(bruto);
  if (resultado.success) return { ok: true, dado: resultado.data };

  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path.map(String).join('.') || 'corpo';
    campos[campo] ??= problema.message;
  }
  const nomes = Object.keys(campos);
  if (nomes.length === 1 && nomes[0] === 'termos') {
    return { ok: false, resposta: erroComStatus(c, 422, CODIGOS_ERRO.termosObrigatorios, MENSAGEM_TERMOS) };
  }
  return {
    ok: false,
    resposta: erroComStatus(c, 422, CODIGOS_ERRO.dadosInvalidos, 'Corrija os campos indicados.', campos),
  };
}
