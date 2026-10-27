/** Banco que o Worker de teste usa pelo Hyperdrive do miniflare. O `setup-worker.ts` recria e migra antes da suíte. */
export const BANCO_DO_WORKER = 'teste_worker';

/**
 * URL do Hyperdrive do Worker de teste: o servidor de `DATABASE_URL_TESTE`, o banco do Worker e a role pelada_app
 * com a senha de `PELADA_APP_SENHA` (a API conecta direto como pelada_app, nunca como owner).
 */
export function urlDoWorker(urlTeste: string, senhaApp: string): string {
  const url = new URL(urlTeste);
  url.username = 'pelada_app';
  url.password = senhaApp;
  url.pathname = `/${BANCO_DO_WORKER}`;
  // O Postgres do compose escuta só em 127.0.0.1: `localhost` tentaria ::1 antes e atrasaria cada conexão.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString();
}

/**
 * URL do banco do Worker de teste como o usuário de `DATABASE_URL_TESTE` (owner), para os testes de rota conferirem
 * o que a pelada_app não lê (a auditoria). Nunca serve à API.
 */
export function urlDoOwnerDoWorker(urlTeste: string): string {
  const url = new URL(urlTeste);
  url.pathname = `/${BANCO_DO_WORKER}`;
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString();
}
