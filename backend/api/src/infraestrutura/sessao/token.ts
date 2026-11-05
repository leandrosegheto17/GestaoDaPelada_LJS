/**
 * Tokens de sessão e de link e a chave do IP (T13; ACE-10, ACE-71, ACE-73). Decisão do design
 * do LJS (`design.md:141-142`), escrita do zero: 32 bytes aleatórios em base64url; o banco
 * guarda só o SHA-256 (o hash é do texto do token, em UTF-8). O IP vira uma chave (IPv4 inteiro,
 * IPv6 pelo prefixo) e só o SHA-256 da chave vai ao banco.
 */

const codificador = new TextEncoder();

/** base64url sem preenchimento. */
function base64url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 de um texto em UTF-8 (32 bytes). */
export async function hashTexto(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', codificador.encode(texto)));
}

/** SHA-256 do token (o que o banco guarda, ACE-10). */
export function hashToken(token: string): Promise<Uint8Array> {
  return hashTexto(token);
}

export interface TokenGerado {
  /** O token em claro: vai ao cookie ou ao link, nunca ao banco. */
  token: string;
  /** O SHA-256 do token: o que o banco guarda. */
  hash: Uint8Array;
}

/** Token novo: 32 bytes de `crypto.getRandomValues`, em base64url (43 caracteres), e o hash dele. */
export async function gerarToken(): Promise<TokenGerado> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(bytes);
  return { token, hash: await hashToken(token) };
}

/** Chave usada quando a requisição não traz IP (ou traz um valor que não é IP). */
export const SEM_IP = 'sem-ip';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Os 8 grupos de 16 bits de um IPv6 (com IPv4 embutido no fim, se houver), ou nulo se inválido. */
function gruposIpv6(ip: string): number[] | null {
  let texto = ip;
  let extra: number[] = [];
  const ultimo = texto.lastIndexOf(':');
  const fim = texto.slice(ultimo + 1);
  if (fim.includes('.')) {
    if (!IPV4.test(fim)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = fim.split('.').map(Number);
    extra = [(a << 8) | b, (c << 8) | d];
    texto = texto.slice(0, ultimo + 1);
    if (!texto.endsWith('::')) texto = texto.slice(0, -1);
  }
  const partes = texto.split('::');
  if (partes.length > 2) return null;
  const ler = (s: string): string[] => (s === '' ? [] : s.split(':'));
  const cabeca = ler(partes[0] ?? '');
  const cauda = partes.length === 2 ? ler(partes[1] ?? '') : [];
  if (![...cabeca, ...cauda].every((h) => /^[0-9a-f]{1,4}$/.test(h))) return null;
  const total = cabeca.length + cauda.length + extra.length;
  if (partes.length === 1 ? total !== 8 : total > 7) return null;
  const numeros = (l: string[]) => l.map((h) => parseInt(h, 16));
  const zeros = partes.length === 2 ? new Array<number>(8 - total).fill(0) : [];
  return [...numeros(cabeca), ...zeros, ...numeros(cauda), ...extra];
}

/**
 * Chave do IP para o limitador e o `ip_hash` (prefixo 64, ACE-71) ou para o teto por origem
 * (prefixo 48, ACE-73): IPv4 inteiro; IPv6 pelos primeiros 64 ou 48 bits, em minúsculas e sem
 * zeros à esquerda; IPv4 mapeado em IPv6 (`::ffff:a.b.c.d`) vale como o IPv4. Sem IP, ou valor
 * que não é IP: `sem-ip`.
 */
export function chaveIp(ip: string | null | undefined, prefixo: 64 | 48 = 64): string {
  if (!ip) return SEM_IP;
  const limpo = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '');
  if (IPV4.test(limpo)) return limpo;
  if (!limpo.includes(':')) return SEM_IP;
  const grupos = gruposIpv6(limpo);
  if (!grupos) return SEM_IP;
  const mapeado = grupos.slice(0, 5).every((g) => g === 0) && grupos[5] === 0xffff;
  if (mapeado) {
    const [g6 = 0, g7 = 0] = grupos.slice(6);
    return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.');
  }
  const n = prefixo / 16;
  return `${grupos
    .slice(0, n)
    .map((g) => g.toString(16))
    .join(':')}::/${prefixo}`;
}

/** SHA-256 da chave do IP: o que vai ao banco (`ip_hash`, `chave_hash`). */
export function hashIp(ip: string | null | undefined, prefixo: 64 | 48 = 64): Promise<Uint8Array> {
  return hashTexto(chaveIp(ip, prefixo));
}
