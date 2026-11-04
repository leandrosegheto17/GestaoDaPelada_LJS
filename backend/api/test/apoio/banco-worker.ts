/** Banco que o Worker de teste usa pelo Hyperdrive do miniflare. O `setup-worker.ts` o recria e migra antes da suíte. */
export const BANCO_DO_WORKER = 'teste_worker';

/** Role de login dos testes do Worker. É membro de `pelada_app`, então tem os mesmos grants e as mesmas policies. */
export const ROLE_DO_WORKER = 'worker_teste';

/**
 * URL do Hyperdrive do Worker de teste: o servidor de `DATABASE_URL_TESTE`, o banco do Worker e a role de login dos
 * testes. A API nunca conecta como o superusuário (que ignora a RLS). A role não se chama `pelada_*` e `pelada_app`
 * não ganha LOGIN: os atributos das roles `pelada_*` fazem parte da impressão digital do schema (FUN-08).
 */
export function urlDoWorker(urlTeste: string, senhaApp: string): string {
  const url = new URL(urlTeste);
  url.username = ROLE_DO_WORKER;
  url.password = senhaApp;
  url.pathname = `/${BANCO_DO_WORKER}`;
  // O Postgres do compose escuta em 127.0.0.1: `localhost` tentaria ::1 antes e atrasaria cada conexão.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString();
}

/** Tabela que o setup cria só para os testes de transação: `pelada_app` escreve nela sem RLS. */
export const TABELA_DE_ESCRITA = 'teste_escrita';
