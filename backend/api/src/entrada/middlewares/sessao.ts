import type { MiddlewareHandler } from 'hono';
import * as sessoes from '../../infraestrutura/db/repositorios/sessoes.ts';
import { lerTokenSessao, limparCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { sha256 } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { sessaoExpirada } from '../erros.ts';

/**
 * Resolve a sessão do cookie `__Host-sessao` ANTES do `comBanco` (AD-007, ACE-47): `sessoes.tocar` roda numa
 * transação curta própria (renova a sessão válida e apaga a vencida) e devolve a conta, que o `comBanco` fixa em
 * `app.conta_id` na primeira consulta da rota. Não recusa ninguém: sem cookie (ou com formato inválido) segue sem
 * conta e sem tocar o banco; com sessão que o banco não aceita mais, limpa o cookie e segue sem conta.
 */
export const carregarSessao: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  const token = lerTokenSessao(c);
  if (token !== null) {
    const hash = await sha256(token);
    const contaId = await sessoes.tocar(c.env.HYPERDRIVE.connectionString, hash);
    if (contaId === null) {
      limparCookieSessao(c);
    } else {
      c.set('contaId', contaId);
      c.set('tokenHash', hash);
    }
  }
  await proximo();
};

/** Sem conta resolvida pela sessão: 401 `sessao_expirada` (ACE-15, ACE-16, ACE-18). */
export const exigirSessao: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  if (!c.get('contaId')) return sessaoExpirada(c);
  await proximo();
};
