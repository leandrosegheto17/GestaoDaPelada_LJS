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

/** IPv4 inteiro (também o mapeado em IPv6), IPv6 reduzido aos `grupos` primeiros grupos de 16 bits, ou `sem-ip`. */
function chavePorPrefixo(ip: string | null | undefined, grupos: number): string {
  const texto = (ip ?? '').trim();
  if (texto === '') return CHAVE_SEM_IP;
  if (IPV4.test(texto)) return texto;
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(texto);
  if (mapeado?.[1]) return mapeado[1];
  const todos = gruposIpv6(texto.toLowerCase());
  // Texto que não é IP válido segue como veio: não cria colisão entre valores diferentes.
  if (!todos) return texto;
  return todos
    .slice(0, grupos)
    .map((g) => g.toString(16))
    .join(':');
}

/**
 * Chave de IP do limitador e do `ip_hash` do bloqueio por e-mail e IP (ACE-71): IPv4 inteiro; IPv6 reduzido ao prefixo
 * /64 (um cliente controla o /64 inteiro, então endereços do mesmo /64 dividem o contador); IPv4 mapeado em IPv6
 * (`::ffff:a.b.c.d`) vale como o IPv4; ausência de IP vira `sem-ip`.
 */
export function chaveDoIp(ip: string | null | undefined): string {
  return chavePorPrefixo(ip, 4);
}

/**
 * Chave de origem do teto de e-mails por hora (ACE-73): como `chaveDoIp`, mas o IPv6 vai ao prefixo /48, a faixa que
 * um *tunnel broker* gratuito ou um provedor de VPS entrega a um só cliente.
 */
export function chaveDoIp48(ip: string | null | undefined): string {
  return chavePorPrefixo(ip, 3);
}
