import { readFileSync } from 'node:fs';

/**
 * Confere a resposta de GET /accounts/{conta}/hyperdrive/configs/{id} da API da Cloudflare:
 * só passa com `success === true` e `result.caching.disabled === true` (booleano). Qualquer outra
 * coisa (vazio, JSON inválido, erro da API, campo ausente ou de outro tipo) lança: falha fechado.
 */
export function cacheDoHyperdriveDesligado(corpo: string): void {
  let resposta: unknown;
  try {
    resposta = JSON.parse(corpo);
  } catch {
    throw new Error('Resposta da API do Hyperdrive não é JSON.');
  }
  const { success, result } = (resposta ?? {}) as {
    success?: unknown;
    result?: { caching?: { disabled?: unknown } } | null;
  };
  if (success !== true) throw new Error('A API do Hyperdrive não respondeu com sucesso.');
  if (result?.caching?.disabled !== true) throw new Error('Cache do Hyperdrive ligado ou ausente na resposta (G-17).');
}

/** Lê a resposta da API em stdin e devolve o código de saída (0 só quando o cache está desligado). */
export function main(argv: readonly string[], lerStdin: () => string = () => readFileSync(0, 'utf8')): number {
  if (!argv.includes('--executar')) {
    console.error('Uso: curl ... | node verificar-cache-hyperdrive-cli.ts --executar   (resposta da API em stdin)');
    return 1;
  }
  try {
    cacheDoHyperdriveDesligado(lerStdin());
    return 0;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}
