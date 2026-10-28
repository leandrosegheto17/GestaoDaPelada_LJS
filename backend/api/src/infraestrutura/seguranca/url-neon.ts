import { hostDaUrl, hostELocal, HostRecusado } from './trava-host.ts';

/**
 * Validação única do destino no Neon (ADR-032), usada em todo caminho que toca o Neon: `pnpm migrar --alvo
 * producao|teste`, `pnpm dono --alvo ...`, `pnpm restaurar --alvo teste`, o dump cifrado (backup e deploy) e a origem do
 * Hyperdrive. Complementa a trava de host (`trava-host.ts`), que continua decidindo se um host remoto pode ser usado.
 * Recusa host local, host fora de `.neon.tech`, host do pooler (`-pooler`), URL sem TLS e usuário fora do papel.
 * Nenhuma mensagem traz a URL nem a senha.
 */

/** Roles padronizadas por papel (`<projeto>_owner`, `<projeto>_app`, `<projeto>_backup_ro`). */
export const ROLES_NEON = {
  owner: 'pelada_owner',
  app: 'pelada_app',
  backup: 'pelada_backup_ro',
} as const;

export type PapelNeon = keyof typeof ROLES_NEON;

/** Únicos `sslmode` aceitos: todos exigem TLS. */
const SSLMODES_COM_TLS = new Set(['require', 'verify-ca', 'verify-full']);

/** Únicos parâmetros aceitos na consulta da URL (nada de `user`, `dbname`, `host`, `options`, `service`...). */
const PARAMETROS_PERMITIDOS = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'application_name']);

export class UrlNeonRecusada extends HostRecusado {}

export interface DestinoNeon {
  host: string;
  banco: string;
  usuario: string;
}

export interface PartesDoDestino {
  host?: unknown;
  banco?: unknown;
  usuario?: unknown;
}

/** Confere host e usuário de um destino do Neon já separado em partes (ex.: a origem do Hyperdrive). */
export function conferirDestinoNeon(partes: PartesDoDestino, papel: PapelNeon): DestinoNeon {
  if (typeof partes.host !== 'string' || partes.host === '') throw new UrlNeonRecusada('Destino do Neon sem host.');
  const host = partes.host.toLowerCase();
  if (hostELocal(host)) throw new UrlNeonRecusada('Destino local recusado: este caminho é só para o Neon.');
  if (!host.endsWith('.neon.tech')) throw new UrlNeonRecusada(`Host fora de .neon.tech recusado (${host}).`);
  if (host.includes('-pooler')) {
    throw new UrlNeonRecusada(`Host do pooler recusado (${host}): use a conexão direta, sem -pooler.`);
  }
  const usuario = typeof partes.usuario === 'string' ? partes.usuario : '';
  if (usuario !== ROLES_NEON[papel]) {
    throw new UrlNeonRecusada(`Usuário do Neon diferente do esperado para este caminho (${ROLES_NEON[papel]}).`);
  }
  const banco = typeof partes.banco === 'string' ? partes.banco : '';
  if (banco === '') throw new UrlNeonRecusada('Destino do Neon sem nome de banco.');
  return { host, banco, usuario };
}

/** Confere a URL de conexão com o Neon para o papel indicado e devolve host, banco e usuário (nunca a senha). */
export function conferirUrlNeon(url: string | undefined, papel: PapelNeon): DestinoNeon {
  if (!url) throw new UrlNeonRecusada('URL do Neon ausente.');
  let analisada: URL;
  try {
    analisada = new URL(url);
  } catch {
    throw new UrlNeonRecusada('URL do Neon inválida.');
  }
  if (analisada.protocol !== 'postgres:' && analisada.protocol !== 'postgresql:') {
    throw new UrlNeonRecusada('URL do Neon com protocolo diferente de postgres ou postgresql.');
  }
  let host: string;
  try {
    host = hostDaUrl(url);
  } catch (erro) {
    throw new UrlNeonRecusada((erro as Error).message);
  }
  for (const nome of new Set(analisada.searchParams.keys())) {
    if (!PARAMETROS_PERMITIDOS.has(nome)) {
      throw new UrlNeonRecusada(
        `Parâmetro não aceito na URL do Neon; aceitos: ${[...PARAMETROS_PERMITIDOS].join(', ')}.`,
      );
    }
    if (analisada.searchParams.getAll(nome).length > 1) {
      throw new UrlNeonRecusada('Parâmetro repetido na URL do Neon.');
    }
  }
  if (!SSLMODES_COM_TLS.has(analisada.searchParams.get('sslmode') ?? '')) {
    throw new UrlNeonRecusada('URL do Neon sem TLS: use sslmode=require (ou verify-ca, verify-full).');
  }
  let usuario: string;
  let banco: string;
  try {
    usuario = decodeURIComponent(analisada.username);
    banco = decodeURIComponent(analisada.pathname.replace(/^\//, ''));
  } catch {
    throw new UrlNeonRecusada('URL do Neon com usuário ou banco mal codificado.');
  }
  return conferirDestinoNeon({ host, banco, usuario }, papel);
}
