#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

/**
 * Saúde depois do deploy (FUN-42): consulta `GET <URL_PUBLICA>/api/health` até responder 200
 * com `versao` igual ao SHA do commit publicado. Tenta de novo em erro de rede, status diferente
 * de 200 ou versão diferente (a Cloudflare leva alguns segundos para servir a versão nova);
 * esgotadas as tentativas, sai com código 1 e o último motivo.
 *
 * Uso no deploy.yml: `node backend/scripts/ops/verificar-saude.mjs`, com `URL_PUBLICA` e o
 * `GITHUB_SHA` do job. Opcionais: `PELADA_SAUDE_TENTATIVAS` (10) e `PELADA_SAUDE_ESPERA_MS` (3000).
 */

export const TENTATIVAS_PADRAO = 10;
export const ESPERA_PADRAO_MS = 3000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Uma consulta: devolve `null` se a saúde confere, ou o motivo de não conferir. */
async function consultar(endereco, sha, buscar) {
  let resposta;
  try {
    resposta = await buscar(endereco, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch (erro) {
    return `sem resposta (${erro instanceof Error ? erro.message : String(erro)})`;
  }
  if (resposta.status !== 200) return `status ${resposta.status}`;
  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    return 'resposta sem JSON';
  }
  if (corpo?.versao !== sha) return `versao "${String(corpo?.versao)}" diferente do SHA ${sha}`;
  return null;
}

/**
 * @param {{ url: string, sha: string, tentativas?: number, esperaMs?: number,
 *   buscar?: (url: string, init?: RequestInit) => Promise<Response> }} opcoes
 * @returns {Promise<{ ok: boolean, tentativas: number, mensagem: string }>}
 */
export async function verificarSaude(opcoes) {
  const { url, sha } = opcoes;
  const tentativas = opcoes.tentativas ?? TENTATIVAS_PADRAO;
  const esperaMs = opcoes.esperaMs ?? ESPERA_PADRAO_MS;
  const buscar = opcoes.buscar ?? ((u, i) => fetch(u, i));
  if (!url) return { ok: false, tentativas: 0, mensagem: 'URL_PUBLICA vazia: não há onde conferir a saúde.' };
  if (!sha) return { ok: false, tentativas: 0, mensagem: 'SHA esperado vazio (GITHUB_SHA).' };

  const endereco = `${url.replace(/\/+$/, '')}/api/health`;
  let motivo = '';
  for (let i = 1; i <= tentativas; i += 1) {
    motivo = await consultar(endereco, sha, buscar);
    if (motivo === null) return { ok: true, tentativas: i, mensagem: `Saúde ok na tentativa ${i}: versao ${sha}.` };
    if (i < tentativas) await dormir(esperaMs);
  }
  return { ok: false, tentativas, mensagem: `Saúde reprovada depois de ${tentativas} tentativas em ${endereco}: ${motivo}.` };
}

function numero(valor, padrao) {
  const n = Number(valor);
  return valor && Number.isFinite(n) && n > 0 ? n : padrao;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = await verificarSaude({
    url: process.env.URL_PUBLICA ?? '',
    sha: process.env.GITHUB_SHA ?? '',
    tentativas: numero(process.env.PELADA_SAUDE_TENTATIVAS, TENTATIVAS_PADRAO),
    esperaMs: numero(process.env.PELADA_SAUDE_ESPERA_MS, ESPERA_PADRAO_MS),
  });
  if (r.ok) console.log(r.mensagem);
  else console.error(r.mensagem);
  process.exitCode = r.ok ? 0 : 1;
}
