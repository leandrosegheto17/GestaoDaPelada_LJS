/** Hosts do Postgres local (seed, migrar, restaurar). */
export const HOSTS_LOCAIS = ['localhost', '127.0.0.1'] as const;
/** Hosts do banco de teste: o local e o serviço `postgres` do CI (FUN-19). */
export const HOSTS_TESTE = ['localhost', '127.0.0.1', 'postgres'] as const;

export class ErroHostNaoPermitido extends Error {
  override name = 'ErroHostNaoPermitido';
}

/**
 * Aborta antes de qualquer conexão quando o host da URL não está na lista (FUN-19, FUN-05).
 * A mensagem nunca traz usuário nem senha da URL.
 */
export function exigirHostPermitido(
  url: string | undefined,
  permitidos: readonly string[] = HOSTS_LOCAIS,
): string {
  if (!url) throw new ErroHostNaoPermitido('URL do banco não definida.');
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new ErroHostNaoPermitido('URL do banco malformada.');
  }
  if (host === '' || !permitidos.includes(host)) {
    throw new ErroHostNaoPermitido(
      `Host do banco não permitido: "${host}". Permitidos: ${permitidos.join(', ')}.`,
    );
  }
  return host;
}
