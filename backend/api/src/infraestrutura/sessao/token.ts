/** Token de sessão e de link: 32 bytes aleatórios em base64url; o banco guarda só o SHA-256 (ACE-10, AD-010). */
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(texto)));
}

/** Token novo e o hash (32 bytes) que vai para o banco. */
export async function gerarToken(): Promise<{ token: string; hash: Uint8Array }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, hash: await sha256(token) };
}

/** SHA-256 do `CF-Connecting-IP`: o IP em si não fica gravado (LGPD). */
export const hashIp = sha256;
