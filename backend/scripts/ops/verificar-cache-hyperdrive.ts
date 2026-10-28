import { readFileSync } from 'node:fs';
import { conferirDestinoNeon } from '../../api/src/infraestrutura/seguranca/url-neon.ts';

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

/**
 * Confere a origem da mesma resposta pela validação única do Neon (ADR-032): `result.origin` com host direto em
 * `.neon.tech` (nunca o pooler nem host local) e o usuário `pelada_app` (nunca o owner, que tem bypassrls). A API
 * não devolve a senha. Qualquer outro formato lança: falha fechado.
 */
export function origemDoHyperdriveNoNeon(corpo: string): void {
  let resposta: unknown;
  try {
    resposta = JSON.parse(corpo);
  } catch {
    throw new Error('Resposta da API do Hyperdrive não é JSON.');
  }
  const origem = ((resposta ?? {}) as { result?: { origin?: Record<string, unknown> | null } | null }).result?.origin;
  if (!origem || typeof origem !== 'object') throw new Error('Origem do Hyperdrive ausente na resposta.');
  conferirDestinoNeon({ host: origem['host'], banco: origem['database'], usuario: origem['user'] }, 'app');
}

/** Lê a resposta da API em stdin e devolve o código de saída (0 só com o cache desligado e a origem válida). */
export function main(argv: readonly string[], lerStdin: () => string = () => readFileSync(0, 'utf8')): number {
  if (!argv.includes('--executar')) {
    console.error('Uso: curl ... | node verificar-cache-hyperdrive-cli.ts --executar   (resposta da API em stdin)');
    return 1;
  }
  try {
    const corpo = lerStdin();
    cacheDoHyperdriveDesligado(corpo);
    origemDoHyperdriveNoNeon(corpo);
    return 0;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}
