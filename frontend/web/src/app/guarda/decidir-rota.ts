import type { SessaoEu } from '@pelada/contrato';
import { destinoDeEntrada, ehAreaProtegida, lerDestino, ROTA_INICIAL } from '../../dados/destino';

/** Para onde ir logo depois de entrar: a página pedida (`volta`), se for válida, senão a lista de grupos. */
export function destinoAposEntrar(volta: string | null | undefined): string {
  return lerDestino(volta) ?? ROTA_INICIAL;
}

/**
 * Para onde redirecionar, ou `null` para deixar a rota abrir. É conveniência de navegação:
 * quem autoriza de verdade é a API.
 * - Sem sessão em `/app/*`: vai a `/entrar?volta=<página>` (ACE-19).
 * - Com sessão em `/entrar`: vai à página de `volta` ou a `/app` (ACE-65).
 */
export function decidirRota(
  sessao: SessaoEu | null,
  { pathname, search }: { pathname: string; search: string },
): string | null {
  if (sessao === null) return ehAreaProtegida(pathname) ? destinoDeEntrada(pathname, search) : null;
  if (pathname === '/entrar') return destinoAposEntrar(new URLSearchParams(search).get('volta'));
  return null;
}
