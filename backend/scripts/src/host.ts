export const HOSTS_LOCAIS: readonly string[] = ['localhost', '127.0.0.1', 'postgres'];

/**
 * Aborta antes de qualquer conexão quando o host da URL não está na lista (FUN-19).
 * A mensagem cita só o host: usuário e senha da URL nunca aparecem.
 */
export function exigirHostPermitido(url: string, permitidos: readonly string[]): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('URL de banco malformada: não foi possível ler o host');
  }
  if (!permitidos.includes(host)) {
    throw new Error(`Host de banco não permitido: "${host}". Permitidos: ${permitidos.join(', ')}`);
  }
}
