import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './sem-url-absoluta.ts';

/**
 * Checagem `email-dev` (T17; ACE-52): `EMAIL_DEV` nunca aparece no `wrangler.jsonc`. Com ela no
 * ar, os e-mails de conta ficariam na caixa em memória do Worker e `GET /api/dev/emails` listaria
 * os links de confirmação e de recuperação de qualquer pessoa. Ela só vale no `.env` local e no
 * e2e. Comentário que cita o nome não reprova.
 */

const NOME = /\bEMAIL_DEV\b/;

/** Tira o comentário de linha (`// ...`) fora de string, o bastante para o JSONC do projeto. */
function semComentario(linha: string): string {
  let emString = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"' && linha[i - 1] !== '\\') emString = !emString;
    if (!emString && c === '/' && linha[i + 1] === '/') return linha.slice(0, i);
  }
  return linha;
}

/** Uma linha por ocorrência: `wrangler.jsonc:<linha>: define EMAIL_DEV`. */
export function checarEmailDev(conteudo: string, caminho = 'wrangler.jsonc'): string[] {
  const problemas: string[] = [];
  conteudo.split('\n').forEach((linha, i) => {
    if (NOME.test(semComentario(linha))) {
      problemas.push(`${caminho}:${i + 1}: define EMAIL_DEV; ela só vale no .env local e no e2e`);
    }
  });
  return problemas;
}

if (import.meta.main) {
  const problemas = checarEmailDev(readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8'));
  for (const p of problemas) console.error(`email-dev: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
