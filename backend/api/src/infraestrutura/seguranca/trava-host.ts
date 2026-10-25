/**
 * Trava de host: nenhum script nem teste escreve num banco remoto sem decisão explícita.
 * Host local passa direto; host remoto exige `--alvo producao|teste` e, além disso,
 * `CI=true` ou a confirmação digitada com o host exato.
 */
export type Alvo = 'producao' | 'teste';

export interface OpcoesTrava {
  url: string | undefined;
  alvo?: string | undefined;
  ci?: string | undefined;
  /** Devolve o que a pessoa digitou quando precisa confirmar o host remoto. */
  confirmar?: () => string | Promise<string>;
}

export class HostRecusado extends Error {}

const HOSTS_LOCAIS = new Set(['localhost', '::1', 'db']);

function octetoValido(parte: string): boolean {
  return /^\d{1,3}$/.test(parte) && Number(parte) <= 255;
}

export function hostELocal(host: string): boolean {
  if (HOSTS_LOCAIS.has(host)) return true;
  const partes = host.split('.');
  return partes.length === 4 && partes.every(octetoValido) && partes[0] === '127';
}

/** Extrai o host sem expor a URL (que pode ter senha). Lança `HostRecusado` se for estranha. */
export function hostDaUrl(url: string | undefined): string {
  if (!url) throw new HostRecusado('Conexão ausente: informe a URL do banco.');
  let analisada: URL;
  try {
    analisada = new URL(url);
  } catch {
    throw new HostRecusado('URL do banco inválida.');
  }
  if (analisada.searchParams.has('host') || analisada.searchParams.has('hostaddr')) {
    throw new HostRecusado('URL do banco com host na consulta não é aceita.');
  }
  const bruto = analisada.hostname.toLowerCase();
  const host = bruto.startsWith('[') && bruto.endsWith(']') ? bruto.slice(1, -1) : bruto;
  if (!host) throw new HostRecusado('URL do banco sem host.');
  if (host.includes(',')) throw new HostRecusado('URL do banco com vários hosts não é aceita.');
  if (host.startsWith('/') || host.includes('%2f')) {
    throw new HostRecusado('Socket de banco não é aceito.');
  }
  return host;
}

/** Lança `HostRecusado` se o host não for local e o alvo não estiver autorizado. */
export async function exigirHostPermitido(opcoes: OpcoesTrava): Promise<string> {
  const host = hostDaUrl(opcoes.url);
  if (hostELocal(host)) return host;

  if (opcoes.alvo !== 'producao' && opcoes.alvo !== 'teste') {
    throw new HostRecusado(`Host remoto (${host}): informe --alvo producao ou --alvo teste.`);
  }
  if (opcoes.ci === 'true') return host;
  const digitado = opcoes.confirmar ? await opcoes.confirmar() : undefined;
  if (digitado !== host) {
    throw new HostRecusado(`Host remoto (${host}): confirmação ausente ou diferente do host.`);
  }
  return host;
}
