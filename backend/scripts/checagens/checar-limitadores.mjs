import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encerrar, falharFechado } from './arquivos.mjs';
import { lerWranglerJsonc } from '../comum/wrangler-jsonc.ts';

// FUN-26, SEC-003: os limitadores de taxa (Rate Limiting do Workers) que a API usa estão declarados no wrangler.jsonc,
// cada um uma vez, com contador próprio (`namespace_id`), limite inteiro positivo e período de 10 ou 60 s (os únicos
// aceitos pela Cloudflare). O período do LIMITE_ESCRITA é o mesmo do `Retry-After` do 429 (`PERIODO_LIMITE_ESCRITA_S`
// em app.ts). Sai com 1 se achar problema e com 2 se não conseguir ler os arquivos (falha fechada).
const RAIZ = process.argv[2] ?? process.cwd();
const WRANGLER = 'wrangler.jsonc';
const APP = 'backend/api/src/entrada/app.ts';

/** Os bindings que o código lê de `c.env` (env.ts). */
const OBRIGATORIOS = ['LIMITE_ENTRAR', 'LIMITE_PUBLICO', 'LIMITE_WEBHOOK', 'LIMITE_ESCRITA'];
const PERIODOS = new Set([10, 60]);

function ler(caminho) {
  try {
    return readFileSync(join(RAIZ, caminho), 'utf8');
  } catch (erro) {
    return falharFechado(`não foi possível ler ${caminho} (${erro.message})`);
  }
}

let config;
try {
  config = lerWranglerJsonc(ler(WRANGLER));
} catch (erro) {
  falharFechado(`${WRANGLER}: ${erro.message}`);
}

const achados = [];
const limitadores = Array.isArray(config.ratelimits) ? config.ratelimits : [];
if (!Array.isArray(config.ratelimits)) achados.push(`${WRANGLER}: sem a lista "ratelimits"`);

const porNome = new Map();
const namespaces = new Map();
for (const l of limitadores) {
  const nome = typeof l?.name === 'string' ? l.name : '(sem nome)';
  if (porNome.has(nome)) achados.push(`${WRANGLER}: ${nome} declarado mais de uma vez`);
  porNome.set(nome, l);
  const ns = l?.namespace_id;
  if (typeof ns !== 'string' || ns === '') achados.push(`${WRANGLER}: ${nome} sem namespace_id`);
  else if (namespaces.has(ns))
    achados.push(`${WRANGLER}: ${nome} e ${namespaces.get(ns)} dividem o namespace_id ${ns}`);
  else namespaces.set(ns, nome);
  const limite = l?.simple?.limit;
  const periodo = l?.simple?.period;
  if (!Number.isInteger(limite) || limite <= 0) achados.push(`${WRANGLER}: ${nome} com limite inválido (${limite})`);
  if (!PERIODOS.has(periodo)) achados.push(`${WRANGLER}: ${nome} com período ${periodo} (só 10 ou 60 s)`);
}
for (const nome of OBRIGATORIOS) {
  if (!porNome.has(nome)) achados.push(`${WRANGLER}: falta o limitador ${nome}`);
}

const escrita = porNome.get('LIMITE_ESCRITA');
if (escrita) {
  const declarado = /export const PERIODO_LIMITE_ESCRITA_S = (\d+);/.exec(ler(APP))?.[1];
  if (declarado === undefined) achados.push(`${APP}: sem PERIODO_LIMITE_ESCRITA_S`);
  else if (Number(declarado) !== escrita.simple?.period) {
    achados.push(
      `${APP}: PERIODO_LIMITE_ESCRITA_S = ${declarado}, mas o LIMITE_ESCRITA do ${WRANGLER} tem período ${escrita.simple?.period}`,
    );
  }
}

encerrar(achados, 'Limitadores de taxa do wrangler.jsonc com problema');
