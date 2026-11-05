import { deBase64url, paraBase64url } from '@pelada/contrato/push';
import { jwkP256 } from './cifra.ts';

/**
 * Cabeçalho VAPID do RFC 8292 (T3; NOT-27), do zero com a Web Crypto (AD-099): JWT ES256 com `aud` = origem do
 * `endpoint`, `exp` = agora + 12 h (o RFC aceita até 24 h) e `sub` = `VAPID_ASSUNTO`, enviado como
 * `Authorization: vapid t=<jwt>, k=<chave pública>` (§3).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - `endpoint` com caminho e consulta: só a origem vai no `aud`.
 * - Duas origens: dois JWT, cada um com o seu `aud`; a mesma origem reaproveita o da invocação (cache).
 * - Chave privada que não casa com a pública: `ErroChavesVapid` antes de qualquer envio. A Web Crypto não promete
 *   conferir o par ao importar o JWK, então a prova é explícita: assina e verifica um texto fixo.
 * - Pública sem 65 bytes ou sem `0x04`, privada sem 32 bytes, assunto vazio: `ErroChavesVapid`.
 *
 * A assinatura ECDSA da Web Crypto já sai em IEEE P1363 (r || s, 64 bytes), que é o formato do JWS.
 */

export const VALIDADE_JWT_S = 12 * 60 * 60;

export interface ChavesVapid {
  /** `VAPID_PUBLICA`: ponto P-256 não comprimido em base64url (65 bytes). */
  publica: string;
  /** `VAPID_PRIVADA`: o `d` da chave em base64url (32 bytes). Segredo. */
  privada: string;
  /** `VAPID_ASSUNTO`: `mailto:` ou URL. */
  assunto: string;
}

export class ErroChavesVapid extends Error {
  override name = 'ErroChavesVapid';
}

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ASSINATURA = { name: 'ECDSA', hash: 'SHA-256' } as const;
const codificador = new TextEncoder();

const texto64 = (valor: unknown): string => paraBase64url(codificador.encode(JSON.stringify(valor)));

/** Chave de assinatura pronta, já conferida contra a pública. */
async function chaveDeAssinatura(chaves: ChavesVapid): Promise<CryptoKey> {
  const publica = deBase64url(chaves.publica);
  const privada = deBase64url(chaves.privada);
  if (!publica || publica.length !== 65 || publica[0] !== 0x04 || !privada || privada.length !== 32) {
    throw new ErroChavesVapid('Chaves VAPID inválidas.');
  }
  if (chaves.assunto.trim() === '') throw new ErroChavesVapid('VAPID_ASSUNTO vazio.');
  try {
    const assinar = await crypto.subtle.importKey('jwk', jwkP256(publica, privada), ECDSA, false, ['sign']);
    const verificar = await crypto.subtle.importKey('jwk', jwkP256(publica), ECDSA, false, ['verify']);
    const prova = codificador.encode('pelada-vapid-par');
    const assinatura = await crypto.subtle.sign(ASSINATURA, assinar, prova);
    if (!(await crypto.subtle.verify(ASSINATURA, verificar, assinatura, prova))) throw new Error('par');
    return assinar;
  } catch {
    throw new ErroChavesVapid('A chave privada VAPID não casa com a pública.');
  }
}

/** Cache da invocação: a chave conferida uma vez e um cabeçalho por origem. */
export interface CacheVapid {
  chave?: Promise<CryptoKey>;
  porOrigem: Map<string, string>;
}

export function novoCacheVapid(): CacheVapid {
  return { porOrigem: new Map() };
}

/** Valor do cabeçalho `Authorization` para o `endpoint`. */
export async function cabecalhoVapid(
  endpoint: string,
  chaves: ChavesVapid,
  agora: Date,
  cache: CacheVapid = novoCacheVapid(),
): Promise<string> {
  const origem = new URL(endpoint).origin;
  const pronto = cache.porOrigem.get(origem);
  if (pronto) return pronto;

  cache.chave ??= chaveDeAssinatura(chaves);
  let chave: CryptoKey;
  try {
    chave = await cache.chave;
  } catch (erro) {
    cache.chave = undefined;
    throw erro;
  }

  const cabecalho = texto64({ typ: 'JWT', alg: 'ES256' });
  const corpo = texto64({ aud: origem, exp: Math.floor(agora.getTime() / 1000) + VALIDADE_JWT_S, sub: chaves.assunto });
  const assinado = `${cabecalho}.${corpo}`;
  const assinatura = new Uint8Array(await crypto.subtle.sign(ASSINATURA, chave, codificador.encode(assinado)));
  const valor = `vapid t=${assinado}.${paraBase64url(assinatura)}, k=${chaves.publica}`;
  cache.porOrigem.set(origem, valor);
  return valor;
}
