import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `so-previa` (FUN-28, AD-004, AD-119): o `wrangler.jsonc` e o `deploy.yml` só
 * publicam o Worker `gestaodapelada-v2`, no endereço padrão da Cloudflare e no único domínio
 * próprio permitido (AD-121). Reprova:
 * - o nome `gestaodapelada` sem o `-v2` (o Worker da versão anterior);
 * - rota ou domínio próprio: a chave `route` ou `routes`, `custom_domain`, e as opções
 *   `--route`, `--routes` e `--domain` do wrangler. A linha do `wrangler.jsonc` que cita `routes` ou
 *   `custom_domain` passa só se o único `pattern` dela for o domínio permitido.
 *
 * O environment `producao` do GitHub passa: pela AD-119 é ele que guarda os secrets da prévia.
 */

export const ARQUIVOS: readonly string[] = ['wrangler.jsonc', '.github/workflows/deploy.yml'];

/** AD-121: o único domínio próprio que o Worker pode ter. */
export const DOMINIO_PERMITIDO = 'gestaodapelada.ljssoftware.com.br';

/** Linha do wrangler.jsonc com a rota do domínio permitido: um `pattern` só, igual ao permitido. */
function rotaPermitida(caminho: string, linha: string): boolean {
  if (caminho !== 'wrangler.jsonc') return false;
  const patterns = [...linha.matchAll(/["']pattern["']\s*:\s*["']([^"']*)["']/g)].map((m) => m[1]);
  return patterns.length === 1 && patterns[0] === DOMINIO_PERMITIDO;
}

const PROIBIDOS: ReadonlyArray<[string, RegExp]> = [
  ['o Worker gestaodapelada sem -v2', /gestaodapelada(?!-v2)/i],
  ['rota própria (route/routes)', /["']?\broutes?["']?\s*:/i],
  ['domínio próprio (custom_domain)', /custom_domain/i],
  ['rota ou domínio na linha de comando do wrangler', /--(?:routes?|domain)\b/i],
];

/** Uma linha por ocorrência: `caminho:linha: cita <o quê>`. */
export function checarSoPrevia(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    conteudo.split('\n').forEach((linha, i) => {
      if (rotaPermitida(caminho, linha) && !/--(?:routes?|domain)/i.test(linha)) {
        if (/gestaodapelada(?!-v2)/i.test(linha.replace(DOMINIO_PERMITIDO, ''))) {
          problemas.push(`${caminho}:${i + 1}: cita o Worker gestaodapelada sem -v2; o único alvo é a prévia gestaodapelada-v2`);
        }
        return;
      }
      for (const [oque, re] of PROIBIDOS) {
        if (re.test(linha)) problemas.push(`${caminho}:${i + 1}: cita ${oque}; o único alvo é a prévia gestaodapelada-v2`);
      }
    });
  }
  return problemas;
}

export function arquivosReais(raiz = RAIZ): Arquivo[] {
  return ARQUIVOS.map((caminho) => ({ caminho, conteudo: readFileSync(join(raiz, caminho), 'utf8') }));
}

if (import.meta.main) {
  const problemas = checarSoPrevia(arquivosReais());
  for (const p of problemas) console.error(`so-previa: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
