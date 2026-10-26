import { hostDaUrl, hostELocal, HostRecusado } from '../../api/src/infraestrutura/seguranca/trava-host.ts';

/** Variável que o wrangler lê no lugar do `localConnectionString` do binding HYPERDRIVE. */
export const VARIAVEL_HYPERDRIVE = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE';

export interface AmbienteDoDev {
  [VARIAVEL_HYPERDRIVE]: string;
  /** Destino do proxy de `/api` no Vite. */
  ALVO_API_DEV: string;
  /** O `.env` da raiz não vira segredo do Worker local: ele recebe só o que o wrangler.jsonc declara. */
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false';
}

/**
 * Variáveis do `pnpm dev` (FUN-04) a partir do `.env`: o Hyperdrive local conecta no Postgres de `DATABASE_URL`
 * como pelada_app (a senha de login vem de `PELADA_APP_SENHA`, a mesma que o seed define), como a API em produção.
 * Recusa banco que não seja local. A mensagem nunca traz a URL.
 */
export function ambienteDoDev(env: Record<string, string | undefined>): AmbienteDoDev {
  const url = env['DATABASE_URL'];
  if (!hostELocal(hostDaUrl(url))) {
    throw new HostRecusado('O pnpm dev só roda com o banco local: DATABASE_URL aponta para outro host.');
  }
  const senha = env['PELADA_APP_SENHA'];
  if (!senha) {
    throw new Error('Defina PELADA_APP_SENHA no .env e rode `pnpm seed` (ele dá essa senha à role pelada_app).');
  }
  const hyperdrive = new URL(url as string);
  hyperdrive.username = 'pelada_app';
  hyperdrive.password = encodeURIComponent(senha);
  // O Postgres do compose escuta só em 127.0.0.1: `localhost` tentaria ::1 antes e atrasaria cada conexão.
  if (hyperdrive.hostname === 'localhost') hyperdrive.hostname = '127.0.0.1';
  return {
    [VARIAVEL_HYPERDRIVE]: hyperdrive.toString(),
    ALVO_API_DEV: 'http://localhost:8787',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  };
}
