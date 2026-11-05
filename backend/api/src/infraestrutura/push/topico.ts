import { paraBase64url } from '@pelada/contrato/push';

/**
 * `Topic` do Web Push (T5; NOT-28, NOT-66; AD-110): os 32 primeiros caracteres do base64url do SHA-256 do id do grupo.
 * O mesmo grupo dá sempre o mesmo tópico, e avisos seguidos ainda não entregues se substituem no serviço de push
 * (RFC 8030 §5.4: até 32 caracteres do alfabeto base64url). O id não aparece no cabeçalho.
 */
export const TAMANHO_TOPICO = 32;

export async function topicoDoGrupo(grupoId: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grupoId)),
  );
  return paraBase64url(hash).slice(0, TAMANHO_TOPICO);
}
