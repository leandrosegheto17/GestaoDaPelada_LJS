import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executarCli } from '../src/conectar.ts';

/**
 * Checagem do Hyperdrive sem cache (FUN-18): as consultas da aplicação nunca podem sair do
 * cache do Hyperdrive, porque dependem do contexto da RLS da transação. Lê a configuração
 * (`wrangler hyperdrive get <id> --json`) e reprova se `caching.disabled` não for `true`.
 *
 * Uso: `node backend/scripts/ops/hyperdrive.ts <id>`, ou com o JSON na entrada padrão:
 * `wrangler hyperdrive get <id> --json | node backend/scripts/ops/hyperdrive.ts`.
 */

export type Resultado = { ok: true } | { ok: false; mensagem: string };

export const MENSAGEM_CACHE_LIGADO =
  'O cache do Hyperdrive está ligado. Desligue com `wrangler hyperdrive update <id> --caching-disabled` (FUN-18).';
export const MENSAGEM_SEM_CACHING =
  'A configuração do Hyperdrive não diz se o cache está desligado (falta `caching.disabled`). Confira o id e a saída do wrangler (FUN-18).';
export const MENSAGEM_JSON_INVALIDO =
  'A saída do wrangler não é um JSON válido de configuração do Hyperdrive (FUN-18).';

function objeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Função pura: recebe o texto da saída do wrangler e diz se o cache está desligado. */
export function conferirSemCache(json: string): Resultado {
  let config: unknown;
  try {
    config = JSON.parse(json);
  } catch {
    return { ok: false, mensagem: MENSAGEM_JSON_INVALIDO };
  }
  if (!objeto(config)) return { ok: false, mensagem: MENSAGEM_JSON_INVALIDO };
  const caching = config.caching;
  if (!objeto(caching) || !('disabled' in caching))
    return { ok: false, mensagem: MENSAGEM_SEM_CACHING };
  if (caching.disabled !== true) return { ok: false, mensagem: MENSAGEM_CACHE_LIGADO };
  return { ok: true };
}

/** Comando do wrangler; o pacote da API é quem o tem instalado. */
export const COMANDO_WRANGLER = ['pnpm', '--filter', '@pelada/api', 'exec', 'wrangler'];

async function lerEntradaPadrao(): Promise<string> {
  const partes: Buffer[] = [];
  for await (const parte of process.stdin) partes.push(parte as Buffer);
  return Buffer.concat(partes).toString('utf8');
}

async function lerConfiguracao(id: string | undefined): Promise<string> {
  if (!id) return lerEntradaPadrao();
  const [cmd, ...args] = COMANDO_WRANGLER;
  const { stdout } = await promisify(execFile)(
    cmd as string,
    [...args, 'hyperdrive', 'get', id, '--json'],
    {
      shell: process.platform === 'win32',
    },
  );
  return stdout;
}

if (import.meta.main) {
  await executarCli(async () => {
    const resultado = conferirSemCache(await lerConfiguracao(process.argv[2]));
    if (!resultado.ok) throw new Error(resultado.mensagem);
    console.log('Hyperdrive com cache desligado.');
  });
}
