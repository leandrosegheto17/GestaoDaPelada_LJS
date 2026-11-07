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
  let consulta: URLSearchParams;
  try {
    const analisada = new URL(url);
    host = analisada.hostname.toLowerCase();
    consulta = analisada.searchParams;
  } catch {
    throw new ErroHostNaoPermitido('URL do banco malformada.');
  }
  // O `pg-connection-string` deixa `?host=` e `?hostaddr=` sobrescreverem o host da URL: o host que a trava vê
  // não seria o da conexão.
  for (const chave of consulta.keys()) {
    if (['host', 'hostaddr'].includes(chave.toLowerCase())) {
      throw new ErroHostNaoPermitido(
        `Host do banco não permitido: a consulta da URL não pode trazer "${chave}".`,
      );
    }
  }
  if (host === '' || !permitidos.includes(host)) {
    throw new ErroHostNaoPermitido(
      `Host do banco não permitido: "${host}". Permitidos: ${permitidos.join(', ')}.`,
    );
  }
  return host;
}
