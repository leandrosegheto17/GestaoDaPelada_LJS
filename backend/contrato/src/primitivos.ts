import { z } from 'zod';

/**
 * Primitivos do contrato de acesso (ACE-03, ACE-05, ACE-68), usados pela API e pelo web.
 * Os limites são os da spec: nome de 2 a 60 caracteres, e-mail até 254, senha de 8 a 72
 * caracteres e até 72 bytes em UTF-8 (o bcrypt ignora o que passa de 72 bytes), token de
 * 32 bytes em base64url.
 */

export const LIMITES = {
  nomeMin: 2,
  nomeMax: 60,
  emailMax: 254,
  senhaMin: 8,
  senhaMax: 72,
  senhaMaxBytes: 72,
} as const;

const codificador = new TextEncoder();

/** Tamanho do texto em bytes UTF-8. */
export function bytesUtf8(texto: string): number {
  return codificador.encode(texto).length;
}

/** E-mail guardado em minúsculas e sem espaços nas pontas (ACE-05); até 254 caracteres (ACE-03). */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(LIMITES.emailMax));

/** Nome de 2 a 60 caracteres, sem os espaços das pontas (ACE-03). */
export const nome = z.string().trim().min(LIMITES.nomeMin).max(LIMITES.nomeMax);

/**
 * Senha nova: 8 a 72 caracteres (ACE-03) e até 72 bytes em UTF-8 (ACE-68). Sem trim: espaço
 * faz parte da senha.
 */
export const senha = z
  .string()
  .min(LIMITES.senhaMin)
  .max(LIMITES.senhaMax)
  .refine((s) => bytesUtf8(s) <= LIMITES.senhaMaxBytes, { message: 'senha_acima_de_72_bytes' });

/**
 * Senha informada para conferir (entrar, trocar, excluir): não aplica os limites da senha nova,
 * para não revelar a regra a quem tenta; só recusa vazia e tamanho absurdo.
 */
export const senhaInformada = z.string().min(1).max(1024);

/** Token de link ou de sessão: 32 bytes em base64url, sem preenchimento (43 caracteres). */
export const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
