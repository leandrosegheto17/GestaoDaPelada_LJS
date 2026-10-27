import { z } from './zod.ts';
import { bytesUtf8, LIMITES } from './limites.ts';
import { email, nomeConta, senha } from './primitivos.ts';

/** Versão dos termos de uso e da privacidade aceita no cadastro (ACE-01, ACE-58). */
// A spec fixa o formato `AAAA-MM-DD` (ACE-58); o valor é provisório (rascunho, ACE-60) até o usuário aprovar o texto.
export const TERMOS_VERSAO = '2026-10-27';

const MENSAGEM_SENHA = `A senha precisa ter de ${LIMITES.senha.min} a ${LIMITES.senha.max} caracteres.`;

/** Senha digitada ao entrar ou ao confirmar a atual: sem regra de mínimo, para não distinguir a mensagem. */
const senhaDigitada = z
  .string()
  .min(1, 'Informe a senha.')
  .refine((valor) => bytesUtf8(valor) <= LIMITES.senha.bytesMax, MENSAGEM_SENHA);

/** Token de link: 32 bytes em base64url (43 caracteres). */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Link inválido.');

const aceite = z.literal(true, { error: 'É preciso aceitar os termos.' });

export const cadastroCorpo = z.strictObject({ nome: nomeConta, email, senha, termos: aceite });
export const entrarCorpo = z.strictObject({ email, senha: senhaDigitada });
export const emailCorpo = z.strictObject({ email });
export const tokenCorpo = z.strictObject({ token });
export const novaSenhaCorpo = z.strictObject({ token, senha });
export const trocarSenhaCorpo = z.strictObject({ senhaAtual: senhaDigitada, novaSenha: senha });
export const excluirCorpo = z.strictObject({ senha: senhaDigitada });
export const conviteCorpo = z.strictObject({ email });
export const conviteCadastroCorpo = z.strictObject({ token, nome: nomeConta, senha, termos: aceite });

export const sessaoEu = z.strictObject({
  id: z.string().min(1),
  nome: z.string(),
  email: z.string(),
  grupos: z.array(
    z.strictObject({
      id: z.string().min(1),
      nome: z.string(),
      slug: z.string(),
      acessaFinanceiro: z.boolean(),
    }),
  ),
});
export type SessaoEu = z.infer<typeof sessaoEu>;

export const adminsResposta = z.strictObject({
  admins: z.array(
    z.strictObject({
      id: z.string().min(1),
      nome: z.string(),
      email: z.string(),
      acessaFinanceiro: z.boolean(),
    }),
  ),
  convites: z.array(z.strictObject({ id: z.string().min(1), email: z.string(), expiraEm: z.iso.datetime() })),
});
export type AdminsResposta = z.infer<typeof adminsResposta>;
