import { createInterface } from 'node:readline/promises';

/** Valor que segue `--nome` na linha de comando. */
export function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

/** Faz a pergunta e lê uma linha da entrada padrão (funciona com terminal ou com pipe). */
export async function perguntar(pergunta: string): Promise<string> {
  const leitura = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await leitura.question(pergunta)).trim();
  } finally {
    leitura.close();
  }
}

/** Confirmação digitada do host remoto; sem terminal interativo não há como confirmar. */
export async function confirmarHost(): Promise<string> {
  if (!process.stdin.isTTY) return '';
  return perguntar('Digite o host do banco para confirmar: ');
}
