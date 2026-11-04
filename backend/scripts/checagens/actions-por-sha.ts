import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');

const SHA_COMPLETO = /^[0-9a-f]{40}$/;
const LINHA_USES = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/;

function* yamls(pasta: string): Generator<string> {
  if (!existsSync(pasta)) return;
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) yield* yamls(caminho);
    else if (/\.ya?ml$/.test(e.name)) yield caminho;
  }
}

/** Tira comentário de fim de linha e aspas do valor de `uses:`. */
function valorDe(bruto: string): string {
  return bruto
    .replace(/\s+#.*$/, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
}

/**
 * Reprova `uses:` de workflow e de action composta que não esteja fixado por SHA de 40 caracteres (FUN-40): tag e
 * branch são móveis, e uma action trocada na origem rodaria com os segredos do CI. Action local (`./...`) passa.
 */
export function checarActionsPorSha(op: { raiz: string }): Resultado {
  const violacoes: string[] = [];
  for (const pasta of ['workflows', 'actions']) {
    for (const arquivo of yamls(join(op.raiz, '.github', pasta))) {
      const caminho = relative(op.raiz, arquivo).split(sep).join('/');
      readFileSync(arquivo, 'utf8')
        .split(/\r?\n/)
        .forEach((linha, i) => {
          const bruto = LINHA_USES.exec(linha)?.[1];
          if (bruto === undefined || linha.trimStart().startsWith('#')) return;
          const valor = valorDe(bruto);
          if (valor.startsWith('./')) return;
          const [, versao = ''] = valor.split('@');
          if (valor.includes('@') && SHA_COMPLETO.test(versao)) return;
          violacoes.push(
            `${caminho}:${i + 1}: "${valor}" não está fixado por SHA de 40 caracteres`,
          );
        });
    }
  }
  return { ok: violacoes.length === 0, violacoes };
}

if (import.meta.main) {
  const r = checarActionsPorSha({ raiz: RAIZ });
  if (r.ok) {
    console.log('actions fixadas por SHA: ok');
  } else {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
}
