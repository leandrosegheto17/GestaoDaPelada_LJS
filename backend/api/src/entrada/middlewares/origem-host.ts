import type { MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';

/**
 * Host e origem da requisição (fundacao /validar, A-12; "Segurança padrão de app web" do CLAUDE.md).
 *
 * - **Host** (421): contra DNS rebinding, que só existe contra o servidor local. Com `EMAIL_DEV=1` (o `.env` local e o
 *   e2e: quando `GET /api/dev/emails` expõe os tokens dos e-mails) só passam o loopback e o host da `URL_PUBLICA`. Sem
 *   `EMAIL_DEV`, nada é restrito: no ar, a Cloudflare só entrega ao Worker os endereços configurados (o `workers.dev`
 *   e o domínio próprio da AD-121, que não é o da `URL_PUBLICA`), e restringir pela `URL_PUBLICA` derrubaria o outro.
 *   Compara o cabeçalho `Host` (o `wrangler dev` troca o host da URL pelo da rota do `wrangler.jsonc`).
 * - **Origem** (403): escrita (todo método fora de GET e HEAD) é recusada quando `Sec-Fetch-Site` existe e não é
 *   `same-origin` nem `none`, ou quando `Origin` existe e não é o do próprio servidor. Sem diferenciar maiúsculas.
 *   O Worker não tem CORS; isto fecha também o formulário de outro site que o `X-Pelada` já barrava.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Nome do host (sem porta), em minúsculas, a partir do valor do cabeçalho `Host` ou de uma URL. */
function hostSemPorta(valor: string): string | null {
  try {
    return new URL(valor.includes('://') ? valor : `http://${valor}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const exigirHostEsperado: MiddlewareHandler<Ambiente> = async (c, next) => {
  if (c.env.EMAIL_DEV === '1') {
    const host = hostSemPorta(c.req.header('Host') ?? c.req.url);
    const publico = c.env.URL_PUBLICA ? hostSemPorta(c.env.URL_PUBLICA) : null;
    if (host === null || !(LOOPBACK.has(host) || host === publico)) {
      return c.json(corpoDoErro('origem_recusada'), 421);
    }
  }
  await next();
};

function ehLeitura(metodo: string): boolean {
  const m = metodo.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export const exigirOrigemPropria: MiddlewareHandler<Ambiente> = async (c, next) => {
  if (!ehLeitura(c.req.method)) {
    const site = c.req.header('Sec-Fetch-Site');
    if (site !== undefined && !['same-origin', 'none'].includes(site.toLowerCase())) {
      return c.json(corpoDoErro('origem_recusada'), 403);
    }
    const origem = c.req.header('Origin');
    if (origem !== undefined) {
      // Compara host e porta com o cabeçalho `Host` (o `wrangler dev` troca o host da URL pelo da rota do
      // `wrangler.jsonc`, mas o navegador manda `Origin` com o endereço que ele abriu).
      let hostDaOrigem: string;
      try {
        hostDaOrigem = new URL(origem).host.toLowerCase();
      } catch {
        return c.json(corpoDoErro('origem_recusada'), 403);
      }
      const proprio = (c.req.header('Host') ?? new URL(c.req.url).host).toLowerCase();
      if (hostDaOrigem !== proprio) return c.json(corpoDoErro('origem_recusada'), 403);
    }
  }
  await next();
};
