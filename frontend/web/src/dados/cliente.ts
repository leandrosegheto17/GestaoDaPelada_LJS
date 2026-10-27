import { ErroApi, ErroRede, ErroResposta, lerCorpoErro } from './erros';

/** Qualquer schema do contrato (Zod) serve: só precisamos de `safeParse`. */
export interface Esquema<T> {
  safeParse(dado: unknown): { success: true; data: T } | { success: false };
}

export type MetodoEscrita = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Para respostas 204 (sem corpo). */
export const semCorpo: Esquema<undefined> = { safeParse: () => ({ success: true, data: undefined }) };

function montarUrl(caminho: string): string {
  if (!caminho.startsWith('/') || caminho.startsWith('//')) {
    throw new Error(`Caminho da API inválido: "${caminho}" (deve começar com um único "/").`);
  }
  return new URL('/api' + caminho, location.origin).toString();
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return undefined;
  }
}

async function enviar<T>(url: string, init: RequestInit, schema: Esquema<T>): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { ...init, credentials: 'same-origin' });
  } catch (erro) {
    if (init.signal?.aborted) throw erro;
    throw new ErroRede(erro);
  }
  if (!resposta.ok) {
    const corpo = lerCorpoErro(await lerJson(resposta));
    if (corpo) throw new ErroApi(resposta.status, corpo);
    throw new ErroResposta(resposta.status, 'erro fora da forma padrão');
  }
  const corpo = resposta.status === 204 ? undefined : await lerJson(resposta);
  const analise = schema.safeParse(corpo);
  if (!analise.success) throw new ErroResposta(resposta.status, 'corpo não confere com o contrato');
  return analise.data;
}

export function ler<T>(caminho: string, schema: Esquema<T>, opcoes: { signal?: AbortSignal } = {}): Promise<T> {
  const init: RequestInit = { method: 'GET' };
  if (opcoes.signal) init.signal = opcoes.signal;
  return enviar(montarUrl(caminho), init, schema);
}

/** Toda escrita leva `X-Pelada: 1` (a API recusa sem ele, ACE-49). */
export function escrever<T>(
  metodo: MetodoEscrita,
  caminho: string,
  corpo: unknown,
  schema: Esquema<T>,
  opcoes: { signal?: AbortSignal } = {},
): Promise<T> {
  const init: RequestInit = { method: metodo, headers: { 'Content-Type': 'application/json', 'X-Pelada': '1' } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  if (opcoes.signal) init.signal = opcoes.signal;
  return enviar(montarUrl(caminho), init, schema);
}
