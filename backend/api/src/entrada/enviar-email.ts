import type { Context } from 'hono';
import * as cotaEmail from '../infraestrutura/db/repositorios/cota-email.ts';
import type { Modelo } from '../infraestrutura/email/modelos.ts';
import type { AppEnv } from './app.ts';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Chave de idempotência do envio: tipo + hash do token (C5). */
export function chaveDeEnvio(tipo: string, tokenHash: Uint8Array): string {
  return `${tipo}-${hex(tokenHash)}`;
}

/**
 * Categoria do envio para o teto diário (ACE-72). O aviso de cadastro duplicado é `cadastro`, como a confirmação
 * do cadastro novo: os dois param juntos, e a resposta não revela se o e-mail tem conta (ACE-04).
 */
export type CategoriaEnvio = 'cadastro' | 'reenvio' | 'convite' | 'recuperacao';

/** Padrão de `LIMITE_EMAILS_DIA`: a cota diária do plano gratuito do Resend. */
export const LIMITE_EMAILS_DIA_PADRAO = 100;

/** `LIMITE_EMAILS_DIA` como inteiro positivo (dígitos decimais); ausente ou inválido, o padrão 100. */
export function limiteEmailsDia(valor: string | undefined): number {
  const texto = valor?.trim() ?? '';
  if (!/^\d+$/.test(texto)) return LIMITE_EMAILS_DIA_PADRAO;
  const limite = Number(texto);
  return Number.isSafeInteger(limite) && limite > 0 ? limite : LIMITE_EMAILS_DIA_PADRAO;
}

/**
 * Quantos e-mails do dia a categoria pode ver enviados, contando o dela: "esqueci a senha" usa a cota inteira;
 * cadastro, reenvio e convite param em 80% (arredondado para baixo), para sobrar cota para a recuperação (ACE-72).
 */
export function tetoDoEnvio(limite: number, categoria: CategoriaEnvio): number {
  return categoria === 'recuperacao' ? limite : Math.floor((limite * 80) / 100);
}

/**
 * Envia o e-mail pelo remetente do app. Antes, reserva o envio no total do dia (fuso de São Paulo); acima do teto da
 * categoria, não envia (ACE-72). Verdadeiro se saiu; falso se o teto barrou ou o remetente falhou: a rota responde
 * 503 `email_indisponivel` e a transação desfaz o cadastro ou o pedido, e também a reserva, então pedir de novo
 * funciona e o envio que falhou não conta (ACE-52).
 */
export async function enviarModelo(
  c: Context<AppEnv>,
  envio: { para: string; modelo: Modelo; chave: string; categoria: CategoriaEnvio },
): Promise<boolean> {
  const teto = tetoDoEnvio(limiteEmailsDia(c.env.LIMITE_EMAILS_DIA), envio.categoria);
  if (!(await cotaEmail.reservar(c.var.db, teto))) {
    // Só a categoria vai para o log: nunca o destino nem o conteúdo (ACE-52).
    console.error(`email: teto diário de envios atingido (${envio.categoria})`);
    return false;
  }
  const { assunto, texto, html } = envio.modelo;
  const resultado = await c.var.remetente.enviar({ para: envio.para, assunto, texto, html, chave: envio.chave });
  return resultado === 'enviado';
}
