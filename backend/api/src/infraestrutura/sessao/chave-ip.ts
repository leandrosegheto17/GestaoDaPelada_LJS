/** Quando a requisição não traz o IP (fora da Cloudflare), todos dividem a mesma chave: falha fechada. */
export const CHAVE_SEM_IP = 'sem-ip';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Expande um IPv6 (com `::`) em 8 grupos numéricos; `undefined` se não for um IPv6 válido. */
function gruposIpv6(texto: string): number[] | undefined {
  const partes = texto.split('::');
  if (partes.length > 2) return undefined;
  const lado = (s: string) => (s === '' ? [] : s.split(':'));
  const antes = lado(partes[0] ?? '');
  const depois = partes.length === 2 ? lado(partes[1] ?? '') : [];
  const falta = 8 - antes.length - depois.length;
  if (partes.length === 2 ? falta < 1 : falta !== 0) return undefined;
  const todos = [...antes, ...Array<string>(partes.length === 2 ? falta : 0).fill('0'), ...depois];
  if (todos.length !== 8 || todos.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return undefined;
  return todos.map((g) => parseInt(g, 16));
}

/**
 * Chave de IP do limitador e do `ip_hash` do bloqueio por e-mail e IP (ACE-71): IPv4 inteiro; IPv6 reduzido ao prefixo
 * /64 (um cliente controla o /64 inteiro, então endereços do mesmo /64 dividem o contador); IPv4 mapeado em IPv6
 * (`::ffff:a.b.c.d`) vale como o IPv4; ausência de IP vira `sem-ip`.
 */
export function chaveDoIp(ip: string | null | undefined): string {
  const texto = (ip ?? '').trim();
  if (texto === '') return CHAVE_SEM_IP;
  if (IPV4.test(texto)) return texto;
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(texto);
  if (mapeado?.[1]) return mapeado[1];
  const grupos = gruposIpv6(texto.toLowerCase());
  // Texto que não é IP válido segue como veio: não cria colisão entre valores diferentes.
  if (!grupos) return texto;
  return grupos
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':');
}
