import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export interface Conferencia {
  ok: boolean;
  mensagem: string;
}

const CORRECAO = 'Corrija com: wrangler hyperdrive update <id> --caching-disabled';

/**
 * Confere a saída de `wrangler hyperdrive get --json` (FUN-18): o cache do Hyperdrive tem de estar desligado, porque
 * a RLS depende do contexto de cada transação e uma resposta em cache serviria o dado de outra conta. Função pura:
 * entrada inválida reprova, nunca lança.
 */
export function conferirSemCache(json: string): Conferencia {
  let dados: unknown;
  try {
    dados = JSON.parse(json);
  } catch {
    return { ok: false, mensagem: 'A saída do wrangler não é um JSON válido.' };
  }
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
    return { ok: false, mensagem: 'A saída do wrangler não é um JSON de objeto.' };
  }
  const caching = (dados as { caching?: unknown }).caching;
  const desligado =
    typeof caching === 'object' &&
    caching !== null &&
    (caching as { disabled?: unknown }).disabled === true;
  if (!desligado) {
    return {
      ok: false,
      mensagem: `O cache do Hyperdrive está ligado (ou não informado). ${CORRECAO}`,
    };
  }
  return { ok: true, mensagem: 'Hyperdrive com o cache desligado.' };
}

export interface SaidaDoComando {
  status: number | null;
  stdout: string;
  stderr?: string;
}

/** Roda `wrangler hyperdrive get <id> --json` a partir do pacote da API, onde o wrangler está instalado. */
function rodarWrangler(id: string): SaidaDoComando {
  const r = spawnSync(
    'pnpm',
    ['--filter', '@pelada/api', 'exec', 'wrangler', 'hyperdrive', 'get', id, '--json'],
    {
      cwd: join(import.meta.dirname, '..', '..', '..'),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Lê o Hyperdrive pelo wrangler e confere o cache. `rodar` existe para o teste não chamar a Cloudflare. */
export function conferirHyperdrive(
  id: string,
  rodar: (id: string) => SaidaDoComando = rodarWrangler,
): Conferencia {
  if (!id || id === 'PREENCHER') {
    return { ok: false, mensagem: 'ID do Hyperdrive ausente (ou ainda com o marcador PREENCHER).' };
  }
  const saida = rodar(id);
  if (saida.status !== 0) {
    return {
      ok: false,
      mensagem: `O wrangler falhou ao ler o Hyperdrive: ${(saida.stderr ?? '').trim() || 'sem detalhe'}`,
    };
  }
  return conferirSemCache(saida.stdout);
}

if (import.meta.main) {
  const resultado = conferirHyperdrive(process.argv[2] ?? '');
  console.log(resultado.mensagem);
  process.exit(resultado.ok ? 0 : 1);
}
