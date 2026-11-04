import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');

/** `wrangler deploy` ou `wrangler publish`, com qualquer espaço entre as palavras (e não `deployments`). */
const DEPLOY = /\bwrangler\s+(?:deploy|publish)\b/;

/** O único arquivo que publica o Worker; a documentação só cita o comando. */
const PERMITIDOS: RegExp[] = [
  /^\.github\/workflows\/deploy\.yml$/,
  /^docs\//,
  /^README\.md$/,
  /^\.specs\//,
  /^\.claude\//,
  /^\.rascunho\//,
  /^backend\/scripts\/checagens\/(test\/)?wrangler-unico(\.test)?\.ts$/,
  /^backend\/scripts\/checagens\/test\/apoio\.ts$/,
  /^backend\/scripts\/test\/deploy-workflow\.test\.ts$/,
];

const PASTAS_IGNORADAS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.wrangler',
  'test-results',
]);
const EXTENSOES = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.yml',
  '.yaml',
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
 * Reprova `wrangler deploy` e `wrangler publish` fora de `.github/workflows/deploy.yml` (FUN-45): todo deploy passa
 * pelo workflow, com aprovação e segredos do ambiente; ninguém publica à mão por um script.
 */
export function checarWranglerUnico(op: { raiz: string }): Resultado {
  const violacoes: string[] = [];
  for (const arquivo of arquivos(op.raiz)) {
    const caminho = relative(op.raiz, arquivo).split(sep).join('/');
    if (PERMITIDOS.some((p) => p.test(caminho))) continue;
    readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .forEach((linha, i) => {
        if (DEPLOY.test(linha)) {
          violacoes.push(`${caminho}:${i + 1}: wrangler deploy só no .github/workflows/deploy.yml`);
        }
      });
  }
  return { ok: violacoes.length === 0, violacoes };
}

if (import.meta.main) {
  const r = checarWranglerUnico({ raiz: RAIZ });
  if (r.ok) {
    console.log('wrangler deploy só no deploy.yml: ok');
  } else {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
}
