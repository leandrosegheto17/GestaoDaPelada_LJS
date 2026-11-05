import type { MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { tocar } from '../../infraestrutura/db/repositorios/sessoes.ts';
import { lerCookieSessao, vencerCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { hashToken } from '../../infraestrutura/sessao/token.ts';

/**
 * Leitura da sessão antes do `comBanco` (T20; ACE-15, ACE-16, ACE-47, ACE-69).
 *
 * Casos limite e estados:
 * - sem cookie (ou cookie vazio): segue sem conta e sem nenhuma consulta ao banco;
 * - cookie de sessão válida: `sessao_tocar` renova o uso e devolve a conta; `contaId` e
 *   `tokenHash` ficam no contexto, e o `comBanco` fixa `app.conta_id` antes da primeira
 *   consulta da rota (ACE-47);
 * - cookie de sessão vencida (15 min sem uso, ACE-15; 12 h desde a criação, ACE-16), de token
 *   desconhecido ou de conta excluída (a exclusão apaga as sessões, ACE-69): segue sem conta e
 *   o cookie é vencido na resposta; a rota com `exigirSessao` responde 401 `sessao_expirada`;
 * - sessão de escopo `troca_de_senha`: `sessao_tocar` só renova as de escopo `completo` e
 *   devolve nulo, então vale como sem sessão.
 *   [LACUNA] a spec não diz o que fazer com o cookie de uma sessão `troca_de_senha` numa rota
 *   comum; o rascunho a trata como inválida e vence o cookie (interpretação conservadora);
 * - duas requisições simultâneas de A e B: cada uma tem a própria conexão do `tocar` e a
 *   própria transação do `comBanco`; o contexto é do `c` da requisição, nunca global;
 * - GET e HEAD: o `tocar` escreve na própria transação curta; a da rota continua `READ ONLY`;
 * - banco fora no `tocar`: o erro sobe e o `onError` responde 503 com a mensagem fixa.
 */

export interface OpcoesSessao {
  /** Só para os testes: troca a fábrica de conexões do `tocar`. */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

export function carregarSessao(opcoes: OpcoesSessao = {}): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const token = lerCookieSessao(c);
    if (!token) {
      await next();
      return;
    }
    const tokenHash = await hashToken(token);
    const conta = await tocar(c.env.HYPERDRIVE.connectionString, tokenHash, opcoes);
    if (conta) {
      c.set('contaId', conta);
      c.set('tokenHash', tokenHash);
    } else {
      // O cookie aponta para uma sessão que não vale mais: o navegador o descarta.
      vencerCookieSessao(c);
    }
    await next();
  };
}

/** Rota que exige sessão: sem conta no contexto, 401 `sessao_expirada`. */
export const exigirSessao: MiddlewareHandler<Ambiente> = async (c, next) => {
  if (!c.var.contaId) return c.json(corpoDoErro('sessao_expirada'), 401);
  await next();
};
