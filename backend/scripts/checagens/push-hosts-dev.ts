import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './sem-url-absoluta.ts';

/**
 * Checagem `push-hosts-dev` (notificacoes T27; NOT-63; AD-109): `PUSH_HOSTS_DEV` nunca aparece no `wrangler.jsonc` nem
 * no `.github/workflows/deploy.yml`. Com ela no ar, a API aceitaria assinatura de push em `localhost` e faria `fetch`
 * nele; ela só vale no `.env` local e no e2e. Comentário que cita o nome não reprova (`//` no JSONC, `#` no YAML).
 * Molde: a checagem `email-dev` (conta-e-acesso T17).
 */

const NOME = /\bPUSH_HOSTS_DEV\b/;

/** Tira o comentário de linha fora de string: `//` no JSONC, `#` no YAML. */
function semComentario(linha: string, marcador: '//' | '#'): string {
  let aspas: string | null = null;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if ((c === '"' || c === "'") && linha[i - 1] !== '\\') {
      if (aspas === null) aspas = c;
      else if (aspas === c) aspas = null;
    }
    if (aspas !== null) continue;
    if (marcador === '//' && c === '/' && linha[i + 1] === '/') return linha.slice(0, i);
    // No YAML, `#` só abre comentário no começo ou depois de espaço.
    if (marcador === '#' && c === '#' && (i === 0 || /\s/.test(linha[i - 1] ?? ''))) return linha.slice(0, i);
  }
  return linha;
}

/** Uma linha por ocorrência: `<caminho>:<linha>: define PUSH_HOSTS_DEV`. */
export function checarPushHostsDev(conteudo: string, caminho: string): string[] {
  const marcador = caminho.endsWith('.yml') || caminho.endsWith('.yaml') ? '#' : '//';
  const problemas: string[] = [];
  conteudo.split('\n').forEach((linha, i) => {
    if (NOME.test(semComentario(linha, marcador))) {
      problemas.push(`${caminho}:${i + 1}: define PUSH_HOSTS_DEV; ela só vale no .env local e no e2e`);
    }
  });
  return problemas;
}

export const ARQUIVOS_VIGIADOS = ['wrangler.jsonc', '.github/workflows/deploy.yml'] as const;

export function checarRepositorio(raiz = RAIZ): string[] {
  return ARQUIVOS_VIGIADOS.flatMap((caminho) => checarPushHostsDev(readFileSync(join(raiz, caminho), 'utf8'), caminho));
}

if (import.meta.main) {
  const problemas = checarRepositorio();
  for (const p of problemas) console.error(`push-hosts-dev: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
