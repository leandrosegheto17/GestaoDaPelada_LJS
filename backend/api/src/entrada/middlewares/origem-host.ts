import type { MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';

/**
 * Host e origem da requisição (fundacao /validar, A-12; "Segurança padrão de app web" do CLAUDE.md).
 *
 * - **Host** (421): contra DNS rebinding. Hosts aceitos: loopback, o host da `URL_PUBLICA` e o endereço `*.workers.dev`
 *   da prévia. Sem `URL_PUBLICA` (local, testes, CI) o host só é restrito ao loopback quando `EMAIL_DEV=1`, que é
 *   quando `GET /api/dev/emails` expõe tokens dos e-mails; fora disso nada é restrito.
 * - **Origem** (403): escrita (todo método fora de GET e HEAD) é recusada quando `Sec-Fetch-Site` existe e não é
 *   `same-origin` nem `none`, ou quando `Origin` existe e não é o do próprio servidor. Sem diferenciar maiúsculas.
 *   O Worker não tem CORS; isto fecha também o formulário de outro site que o `X-Pelada` já barrava.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostPermitido(host: string, urlPublica: string, emailDev: boolean): boolean {
  if (LOOPBACK.has(host)) return true;
  const publico = urlPublica === '' ? null : hostDe(urlPublica);
  if (publico === null) return !emailDev;
  return host === publico || host.endsWith('.workers.dev');
}

export const exigirHostEsperado: MiddlewareHandler<Ambiente> = async (c, next) => {
  const host = hostDe(c.req.url);
  if (host === null || !hostPermitido(host, c.env.URL_PUBLICA ?? '', c.env.EMAIL_DEV === '1')) {
    return c.json(corpoDoErro('origem_recusada'), 421);
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
      let propria: string;
      try {
        propria = new URL(c.req.url).origin.toLowerCase();
      } catch {
        return c.json(corpoDoErro('origem_recusada'), 403);
      }
      if (origem.toLowerCase() !== propria) return c.json(corpoDoErro('origem_recusada'), 403);
    }
  }
  await next();
};
