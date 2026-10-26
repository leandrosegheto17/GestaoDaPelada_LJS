import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import type { Hono } from 'hono';
import { criarApp, type AppEnv, type OpcoesApp } from '../../src/entrada/app.ts';

export interface RespostaTeste {
  status: number;
  headers: Headers;
  corpo: unknown;
  texto: string;
}

function lerJson(texto: string): unknown {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/** Limitador que nunca limita: os testes fazem muitas chamadas seguidas. */
export const SEM_LIMITE = { limit: async () => ({ success: true }) };

/**
 * Chama o app completo (todos os middlewares) dentro do workerd e espera o `waitUntil` terminar.
 * `preparar` acrescenta rotas de teste depois dos middlewares.
 */
export async function chamar(
  caminho: string,
  init: RequestInit = {},
  opcoes: {
    app?: OpcoesApp;
    env?: Cloudflare.Env;
    preparar?: (app: Hono<AppEnv>) => void;
  } = {},
): Promise<RespostaTeste> {
  const app = criarApp({ limitadores: { entrar: SEM_LIMITE, publico: SEM_LIMITE }, ...opcoes.app });
  opcoes.preparar?.(app);
  const ctx = createExecutionContext();
  const resposta = await app.fetch(new Request(`http://app.invalid${caminho}`, init), opcoes.env ?? env, ctx);
  await waitOnExecutionContext(ctx);
  const texto = await resposta.text();
  return { status: resposta.status, headers: resposta.headers, corpo: lerJson(texto), texto };
}

/** Confere o formato padrão de erro: `{ erro: { codigo, mensagem } }`, código em snake_case. */
export function ehErroPadrao(corpo: unknown): boolean {
  const erro = (corpo as { erro?: { codigo?: unknown; mensagem?: unknown } } | null)?.erro;
  return (
    typeof erro?.codigo === 'string' &&
    /^[a-z][a-z0-9_]*$/.test(erro.codigo) &&
    typeof erro.mensagem === 'string' &&
    erro.mensagem.length > 0
  );
}
