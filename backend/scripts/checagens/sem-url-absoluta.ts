import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');

const PROIBIDOS = ['ljssoftware.com.br', 'workers.dev'];

/** Caminhos (relativos à raiz, com `/`) em que a URL pode aparecer: configuração, documentação e a própria checagem. */
const PERMITIDOS: RegExp[] = [
  /^wrangler\.jsonc$/,
  /^\.env\.example$/,
  /^docs\//,
  /^\.specs\//,
  /^\.claude\//,
  /^\.rascunho\//,
  /^backend\/scripts\/checagens\/(test\/)?sem-url-absoluta(\.test)?\.ts$/,
];

const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', '.git', 'coverage', '.wrangler']);
const EXTENSOES = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.sql',
  '.yml',
  '.yaml',
  '.md',
  '.html',
  '.css',
  '.txt',
  '.sh',
  '.toml',
]);

function* arquivos(pasta: string): Generator<string> {
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!PASTAS_IGNORADAS.has(e.name)) yield* arquivos(join(pasta, e.name));
    } else if (EXTENSOES.has(extname(e.name))) {
      yield join(pasta, e.name);
    }
  }
}

/**
 * Reprova `ljssoftware.com.br` e `workers.dev` no código e nas migrações, fora da lista permitida (FUN-23). A única
 * fonte da URL do app é a variável `URL_PUBLICA`, injetada no deploy.
 */
export function checarSemUrlAbsoluta(op: { raiz: string }): Resultado {
  const violacoes: string[] = [];
  for (const arquivo of arquivos(op.raiz)) {
    const caminho = relative(op.raiz, arquivo).split(sep).join('/');
    if (PERMITIDOS.some((p) => p.test(caminho))) continue;
    const linhas = readFileSync(arquivo, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      const achado = PROIBIDOS.find((p) => linha.includes(p));
      if (achado)
        violacoes.push(`${caminho}:${i + 1}: contém "${achado}"; use a variável URL_PUBLICA`);
    });
  }
  return { ok: violacoes.length === 0, violacoes };
}

if (import.meta.main) {
  const r = checarSemUrlAbsoluta({ raiz: RAIZ });
  if (r.ok) {
    console.log('sem URL absoluta: ok');
  } else {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
}
