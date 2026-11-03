export const HOSTS_PERMITIDOS = ['localhost', '127.0.0.1', 'postgres'];

/**
 * Aborta antes de conectar quando o host da URL não está na lista.
 * A mensagem nunca inclui usuário, senha nem a URL inteira.
 */
export function exigirHostPermitido(
  url: string,
  permitidos: readonly string[] = HOSTS_PERMITIDOS,
): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('URL do banco inválida: não foi possível ler o host');
  }
  if (!permitidos.includes(host)) {
    throw new Error(`Host do banco não permitido: "${host}". Permitidos: ${permitidos.join(', ')}`);
  }
}
