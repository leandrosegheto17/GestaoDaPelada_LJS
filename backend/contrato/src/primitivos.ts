import { z } from 'zod';
import { LIMITES, bytesUtf8 } from './limites';

/** E-mail normalizado: sem espaços nas pontas, em minúsculas, até 254 caracteres (ACE-03, ACE-05). */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITES.emailMax, 'E-mail muito longo.')
  .pipe(z.email('Informe um e-mail válido.'));

const MENSAGEM_SENHA = `A senha precisa ter de ${LIMITES.senha.min} a ${LIMITES.senha.max} caracteres.`;

/** Senha: de 8 a 72 caracteres (pontos de código) e no máximo 72 bytes em UTF-8 (ACE-68). */
export const senha = z.string().refine((valor) => {
  const caracteres = [...valor].length;
  return (
    caracteres >= LIMITES.senha.min && caracteres <= LIMITES.senha.max && bytesUtf8(valor) <= LIMITES.senha.bytesMax
  );
}, MENSAGEM_SENHA);

/** Nome da conta: de 2 a 60 caracteres (ACE-03). */
export const nomeConta = z
  .string()
  .trim()
  .min(LIMITES.nomeAdmin.min, 'Informe o nome.')
  .max(LIMITES.nomeAdmin.max, 'Nome muito longo.');
