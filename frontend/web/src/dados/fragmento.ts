import { token as esquemaToken } from '@pelada/contrato/primitivos';

/**
 * Token dos links de e-mail (confirmação, nova senha, convite) no fragmento `#t=<token>`
 * (ACE-06, ACE-24): o fragmento não vai ao servidor nem ao `Referer`. A leitura acontece uma
 * vez: o fragmento sai da barra na hora, com `history.replaceState` (sem nova entrada no
 * histórico), mesmo quando o token é malformado. Decisão do design do LJS (`design.md:200`).
 */
export function lerTokenDoFragmento(janela: Window = window): string | null {
  const hash = janela.location.hash;
  if (!hash.startsWith('#')) return null;
  const valor = new URLSearchParams(hash.slice(1)).get('t');
  if (valor === null) return null;

  const { pathname, search } = janela.location;
  janela.history.replaceState(janela.history.state, '', `${pathname}${search}`);

  const r = esquemaToken.safeParse(valor);
  return r.success ? r.data : null;
}
