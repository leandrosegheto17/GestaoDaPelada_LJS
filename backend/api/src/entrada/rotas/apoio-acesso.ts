import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { corpoDoErro, erroDeValidacao } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { registrarOrigem } from '../../aplicacao/acesso/enviar-email.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';

/**
 * Apoio das rotas de acesso (T25 a T30): leitura do corpo pelo contrato, contagem do pedido de
 * e-mail por origem e as respostas de erro comuns. As rotas são finas: validam, chamam o
 * repositório e o envio e respondem com os códigos da spec.
 */

export interface OpcoesRotas {
  /** Só para os testes: fábrica de conexões do `comBanco` e das transações curtas (como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

/** As opções de fábrica no formato do `comBanco` e do `registrarOrigem`. */
export function comFabrica(opcoes: OpcoesRotas): { fabrica?: NonNullable<OpcoesCliente['fabrica']> } {
  return opcoes.fabrica ? { fabrica: opcoes.fabrica } : {};
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; resposta: Response };

/**
 * Lê o corpo JSON pelo schema do contrato. JSON inválido ou fora do schema: 422 com o código
 * (`termos_obrigatorios` ou `dados_invalidos`) e os campos (ACE-02, ACE-03).
 */
export async function lerCorpo<S extends z.ZodType>(c: Context<Ambiente>, schema: S): Promise<Leitura<z.infer<S>>> {
  let bruto: unknown;
  try {
    bruto = await c.req.json();
  } catch {
    return { ok: false, resposta: c.json(corpoDoErro('dados_invalidos'), 422) };
  }
  const r = schema.safeParse(bruto);
  if (!r.success) return { ok: false, resposta: c.json(erroDeValidacao(r.error), 422) };
  return { ok: true, dados: r.data };
}

/** O IP da requisição na Cloudflare (`cf-connecting-ip`), ou nulo. */
export function ipDa(c: Context<Ambiente>): string | null {
  return c.req.header('cf-connecting-ip') ?? null;
}

/** 503 `email_indisponivel` (ACE-52, ACE-72, ACE-75). */
export function emailIndisponivel(c: Context<Ambiente>): Response {
  return c.json(corpoDoErro('email_indisponivel'), 503);
}

/**
 * Conta o pedido de e-mail da origem ao chegar (ACE-73), antes de validar o corpo e de abrir a
 * transação da rota; acima de 20 por hora, 429 `muitas_requisicoes` sem enviar.
 */
export function contarPedidoDeEmail(opcoes: OpcoesRotas = {}): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const ok = await registrarOrigem(c.env.HYPERDRIVE.connectionString, ipDa(c), comFabrica(opcoes));
    if (!ok) return c.json(corpoDoErro('muitas_requisicoes'), 429);
    await next();
  };
}

/** Hexadecimal de um hash, para a chave de idempotência do Resend (tipo + hash do token). */
export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
