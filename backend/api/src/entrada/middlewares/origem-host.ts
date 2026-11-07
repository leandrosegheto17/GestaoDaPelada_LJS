import type { MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';

/**
 * Origem das escritas (fundacao /validar, A-12; "Segurança padrão de app web" do CLAUDE.md; AD-131).
 *
 * Escrita (todo método fora de GET e HEAD) é recusada com 403 quando `Sec-Fetch-Site` existe e não é `same-origin` nem
 * `none`, ou quando `Origin` existe e não é um destes (sem diferenciar maiúsculas, com porta): o cabeçalho `Host`, o
 * host da `URL_PUBLICA` e, com `EMAIL_DEV=1` (só local), qualquer loopback. O Worker não tem CORS; isto fecha também o
 * formulário de outro site que o `X-Pelada` já barrava.
 *
 * O 421 por `Host` (DNS rebinding) **não** está aqui (AD-131): o `wrangler dev` troca o `Host` pelo domínio da rota do
 * `wrangler.jsonc` antes de o Worker ver a requisição (conferido, `mf-original-hostname` inclusive), então o Worker não
 * tem como distinguir o host verdadeiro; e no ar a Cloudflare só entrega os endereços configurados.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostDe(valor: string): { host: string; nome: string } | null {
  try {
    const u = new URL(valor.includes('://') ? valor : `http://${valor}`);
    return { host: u.host.toLowerCase(), nome: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

function origemPermitida(origem: string, c: Parameters<MiddlewareHandler<Ambiente>>[0]): boolean {
  const o = hostDe(origem);
  if (o === null) return false;
  const proprio = c.req.header('Host') ?? new URL(c.req.url).host;
  if (o.host === proprio.toLowerCase()) return true;
  const publico = c.env.URL_PUBLICA ? hostDe(c.env.URL_PUBLICA) : null;
  if (publico !== null && o.host === publico.host) return true;
  return c.env.EMAIL_DEV === '1' && LOOPBACK.has(o.nome);
}

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
    if (origem !== undefined && !origemPermitida(origem, c)) {
      return c.json(corpoDoErro('origem_recusada'), 403);
    }
  }
  await next();
};
