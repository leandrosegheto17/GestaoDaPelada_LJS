import type { MiddlewareHandler } from 'hono';
import { emTransacaoPropria } from '../../infraestrutura/db/index.ts';
import * as cotaEmail from '../../infraestrutura/db/repositorios/cota-email.ts';
import { chaveDoIp48 } from '../../infraestrutura/sessao/chave-ip.ts';
import { hashIp } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { muitasRequisicoes } from '../erros.ts';

/** Padrão de `LIMITE_EMAILS_IP_HORA` (ACE-73). */
export const LIMITE_EMAILS_IP_HORA_PADRAO = 20;

/** `LIMITE_EMAILS_IP_HORA` como inteiro positivo (dígitos decimais); ausente ou inválido, o padrão 20. */
export function limiteEmailsIpHora(valor: string | undefined): number {
  const texto = valor?.trim() ?? '';
  if (!/^\d+$/.test(texto)) return LIMITE_EMAILS_IP_HORA_PADRAO;
  const limite = Number(texto);
  return Number.isSafeInteger(limite) && limite > 0 ? limite : LIMITE_EMAILS_IP_HORA_PADRAO;
}

/**
 * Teto de pedidos de e-mail por origem (ACE-73; SEC-CA-02): o IPv4 inteiro ou o /48 do IPv6 pede no máximo
 * `LIMITE_EMAILS_IP_HORA` (padrão 20) e-mails por hora, somando cadastro, reenvio de confirmação, convite e "esqueci
 * a senha". Acima disso, 429 `muitas_requisicoes` antes de a rota rodar, então nada é enviado e a cota do dia não é
 * reservada. Todo pedido conta, tenha conta ou não o e-mail: a resposta não revela nada. O registro vai numa transação
 * própria e curta: fica gravado mesmo quando a rota responde erro, e a trava da origem não fica presa durante o envio.
 * O IP só vira o SHA-256 da chave: não é guardado em claro nem logado.
 */
export const limiteEmailsOrigem: MiddlewareHandler<AppEnv> = async (c, proximo) => {
  if (c.req.method !== 'POST') return proximo();
  const chaveHash = await hashIp(chaveDoIp48(c.req.header('CF-Connecting-IP')));
  const teto = limiteEmailsIpHora(c.env.LIMITE_EMAILS_IP_HORA);
  const permitido = await emTransacaoPropria(c.env.HYPERDRIVE.connectionString, {}, (db) =>
    cotaEmail.registrarOrigem(db, chaveHash, teto),
  );
  if (!permitido) return muitasRequisicoes(c);
  return proximo();
};
