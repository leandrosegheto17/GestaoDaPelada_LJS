import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import type { ErrorEvent } from '@sentry/cloudflare';
import { vi } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { SEM_LIMITE } from './cliente.ts';

// Chave pública no formato real (hex): com hífen, o SDK considera o DSN inválido e não envia nada.
export const DSN = 'https://0123456789abcdef0123456789abcdef@o0.ingest.sentry.invalid/1';
export const EMAIL = 'fulano.silva@exemplo.com';

/** Captura o que sairia para a rede: o transporte do Sentry usa o `fetch` global. */
export function espiarRede() {
  const chamadas: { url: string; corpo: string }[] = [];
  const espiao = vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    const corpo = init?.body ?? (entrada instanceof Request ? await entrada.text() : '');
    chamadas.push({ url, corpo: typeof corpo === 'string' ? corpo : await new Response(corpo).text() });
    return new Response('{}', { status: 200 });
  });
  return { chamadas, espiao };
}

/** Eventos de erro de um envelope do Sentry (uma linha de cabeçalho por item, depois o item). */
export function eventosDe(envelope: string): ErrorEvent[] {
  const linhas = envelope.split('\n').filter((l) => l.trim() !== '');
  const eventos: ErrorEvent[] = [];
  for (let i = 1; i < linhas.length; i += 2) {
    const cabecalho = JSON.parse(linhas[i] ?? '{}') as { type?: string };
    if (cabecalho.type === 'event') eventos.push(JSON.parse(linhas[i + 1] ?? '{}') as ErrorEvent);
  }
  return eventos;
}

/** App com uma rota que registra um breadcrumb com e-mail e lança um erro com e-mail; `cabecalhosExtras` vão na requisição. */
export async function requisicaoQueFalha(
  ambiente: Cloudflare.Env,
  cabecalhosExtras: Record<string, string> = {},
): Promise<Response> {
  const app = criarApp({ limitadores: { entrar: SEM_LIMITE, publico: SEM_LIMITE } });
  app.post('/api/teste/falha', async (c) => {
    await c.req.text();
    console.log(`processando ${EMAIL}`);
    throw new Error(`falhou para ${EMAIL}`);
  });
  const ctx = createExecutionContext();
  const resposta = await app.fetch(
    new Request('http://app.invalid/api/teste/falha?email=' + encodeURIComponent(EMAIL), {
      method: 'POST',
      headers: {
        'X-Pelada': '1',
        Cookie: 'sessao=segredo-do-cookie',
        Authorization: 'Bearer segredo-do-token',
        'Content-Type': 'application/json',
        ...cabecalhosExtras,
      },
      body: JSON.stringify({ email: EMAIL, senha: 'segredo-da-senha' }),
    }),
    ambiente,
    ctx,
  );
  // O Sentry só descarrega os eventos depois que o corpo da resposta termina, como no workerd de verdade.
  const texto = await resposta.text();
  await waitOnExecutionContext(ctx);
  return new Response(texto, { status: resposta.status, headers: resposta.headers });
}
