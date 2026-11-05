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
 *
 * Asaas (planos-e-cobranca T40; PLA-38, AD-061): enquanto não houver AD de produção do Asaas, só o sandbox. Reprova:
 * - o endereço de produção da API do Asaas (`api.asaas.com`, sem o `-sandbox`);
 * - linha que cita `ASAAS_URL` sem o valor literal do sandbox (`https://api-sandbox.asaas.com/v3`), ou com outro
 *   endereço junto: o valor vindo de `vars.`, `secrets.` ou de variável de shell no `deploy.yml` não pode ser conferido
 *   e reprova também.
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

/** PLA-38: o único endereço do Asaas permitido enquanto não houver AD de produção. */
export const ASAAS_URL_SANDBOX = 'https://api-sandbox.asaas.com/v3';

/** A linha cita `ASAAS_URL` com outro valor que não o sandbox, ou com algum endereço além dele. */
function asaasForaDoSandbox(linha: string): boolean {
  if (!/\bASAAS_URL\b/.test(linha)) return false;
  if (!linha.includes(ASAAS_URL_SANDBOX)) return true;
  const enderecos = [...linha.matchAll(/https?:\/\/[^\s"'`,)}]+/g)].map((m) => m[0].replace(/\/+$/, ''));
  return enderecos.some((e) => e !== ASAAS_URL_SANDBOX);
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
      if (rotaPermitida(caminho, linha) && !/--(?:routes?|domain)\b/i.test(linha)) {
        if (/gestaodapelada(?!-v2)/i.test(linha.replace(DOMINIO_PERMITIDO, ''))) {
          problemas.push(`${caminho}:${i + 1}: cita o Worker gestaodapelada sem -v2; o único alvo é a prévia gestaodapelada-v2`);
        }
        return;
      }
      for (const [oque, re] of PROIBIDOS) {
        if (re.test(linha)) problemas.push(`${caminho}:${i + 1}: cita ${oque}; o único alvo é a prévia gestaodapelada-v2`);
      }
      if (/(?<![\w-])api\.asaas\.com/i.test(linha)) {
        problemas.push(`${caminho}:${i + 1}: cita a API de produção do Asaas; só o sandbox até haver AD de produção (PLA-38)`);
      } else if (asaasForaDoSandbox(linha)) {
        problemas.push(`${caminho}:${i + 1}: ASAAS_URL diferente de ${ASAAS_URL_SANDBOX} (PLA-38)`);
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
