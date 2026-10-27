/**
 * Lê o token do fragmento `#t=<token>` da URL e apaga o fragmento da barra de endereço (AD-010), para o token não
 * ficar no histórico nem ser copiado junto com o endereço. Sem fragmento `t`, devolve `null` e não mexe na URL.
 */
export function lerTokenDoFragmento(): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token === null) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  return token === '' ? null : token;
}
