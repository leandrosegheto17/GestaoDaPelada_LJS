import { executarCli } from './conectar.ts';

/**
 * `pnpm vapid:gerar` (T4; NOT-14, NOT-60): imprime um par P-256 novo para o VAPID, `VAPID_PUBLICA` (ponto não
 * comprimido, 65 bytes) e `VAPID_PRIVADA` (o `d`, 32 bytes), em base64url. Não grava arquivo nenhum: quem roda copia
 * a pública para o `.env`/`--var` e a privada para o secret do Worker (passo do `/preparar` Nível 2).
 */

export interface ParVapid {
  publica: string;
  privada: string;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export async function gerarParVapid(): Promise<ParVapid> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  if (!jwk.d) throw new Error('A chave gerada não trouxe o d.');
  return { publica: base64url(publica), privada: jwk.d };
}

/** As linhas que o script imprime, no formato do `.env`. */
export function linhasDoPar(par: ParVapid): string {
  return [
    '# Par VAPID novo. A privada é segredo: secret do Worker, nunca no git nem no .env.example.',
    `VAPID_PUBLICA=${par.publica}`,
    `VAPID_PRIVADA=${par.privada}`,
  ].join('\n');
}

if (import.meta.main) {
  await executarCli(async () => {
    console.log(linhasDoPar(await gerarParVapid()));
  });
}
