import type { ServerOptions } from 'vite';

/** Porta padrão do `wrangler dev`, onde o Worker atende `/api/*` localmente. */
export const PORTA_DO_WORKER = 8787;

/**
 * Servidor de desenvolvimento (FUN-04): proxy de `/api` para o Worker local, na mesma origem (o cookie de sessão e o
 * `X-Pelada` funcionam como em produção). `ALVO_API_DEV` troca o destino; `CHOKIDAR_USEPOLLING=true` liga o polling.
 */
export function configuracaoServidor(env: Record<string, string | undefined>): ServerOptions {
  const alvo = env['ALVO_API_DEV']?.trim() || `http://localhost:${PORTA_DO_WORKER}`;
  const servidor: ServerOptions = {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: alvo, changeOrigin: false } },
  };
  if (env['CHOKIDAR_USEPOLLING'] === 'true') servidor.watch = { usePolling: true };
  return servidor;
}
