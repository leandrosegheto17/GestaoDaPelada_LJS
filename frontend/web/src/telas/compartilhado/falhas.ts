import { ErroApi } from '../../dados/erros';

/** ACE-52: o provedor de e-mail está fora do ar ou a cota acabou (503 `email_indisponivel`). */
export const TEXTO_EMAIL_INDISPONIVEL = 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.';

export function ehEmailIndisponivel(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 503 && erro.codigo === 'email_indisponivel';
}
