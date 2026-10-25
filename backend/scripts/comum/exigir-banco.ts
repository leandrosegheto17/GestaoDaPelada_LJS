import { connect } from 'node:net';

const MENSAGEM = 'Banco local fora do ar. Rode `docker compose up -d` e tente de novo.';

function destino(url: string | undefined): { host: string; port: number } {
  const { hostname, port } = new URL(url ?? '');
  return { host: hostname, port: Number(port || 5432) };
}

/** Confere que o Postgres atende na porta da URL; senão, falha dizendo qual passo falta (FUN-53). */
export async function exigirBancoNoAr(url: string | undefined, esperaMs = 2000): Promise<void> {
  let alvo: { host: string; port: number };
  try {
    alvo = destino(url);
  } catch {
    throw new Error(MENSAGEM);
  }
  await new Promise<void>((ok, falha) => {
    const conexao = connect({ ...alvo, timeout: esperaMs });
    conexao.once('connect', () => {
      conexao.destroy();
      ok();
    });
    const recusar = () => {
      conexao.destroy();
      falha(new Error(MENSAGEM));
    };
    conexao.once('error', recusar);
    conexao.once('timeout', recusar);
  });
}
