import { executarCli } from '../src/conectar.ts';

/**
 * Branch de restauração no Neon (FUN-42, AD-119): antes da migração do deploy, cria pela API do
 * Neon uma branch a partir da `main` (a produção), com o nome `restauracao-<run_id>`, e mantém só
 * as 2 de restauração mais recentes. Nunca apaga a `main`, a `dev`, a branch padrão, uma
 * protegida ou qualquer branch cujo nome não comece por `restauracao-`.
 *
 * Uso no deploy.yml: `node backend/scripts/ops/restauracao-neon.ts`, com `NEON_API_KEY`,
 * `NEON_PROJECT_ID` e `GITHUB_RUN_ID` no ambiente. Erro da API sai com código 1, sem a chave
 * na mensagem.
 */

export const API_NEON = 'https://console.neon.tech/api/v2';
export const PREFIXO = 'restauracao-';
export const PAI = 'main';
export const MANTER = 2;

/** Nomes que nunca são apagados, mesmo que um dia comecem pelo prefixo. */
const INTOCAVEIS: ReadonlySet<string> = new Set(['main', 'dev']);

export interface BranchNeon {
  id: string;
  name: string;
  parent_id?: string;
  created_at: string;
  default?: boolean;
  protected?: boolean;
}

export class ErroNeon extends Error {
  override name = 'ErroNeon';
}

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpcoesRestauracao {
  apiKey: string;
  projeto: string;
  runId: string;
  buscar?: Buscar;
}

export interface ResultadoRestauracao {
  criada: BranchNeon;
  apagadas: string[];
}

async function chamar<T>(
  buscar: Buscar,
  apiKey: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const resposta = await buscar(`${API_NEON}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    // Só o método, o caminho e o status: a mensagem não leva a chave nem o corpo da resposta.
    throw new ErroNeon(`API do Neon respondeu ${resposta.status} em ${metodo} ${caminho}.`);
  }
  return (await resposta.json()) as T;
}

/** Branches de restauração que sobram depois de manter as `manter` mais recentes. */
export function paraApagar(branches: readonly BranchNeon[], manter = MANTER): BranchNeon[] {
  const deRestauracao = branches.filter(
    (b) => b.name.startsWith(PREFIXO) && !INTOCAVEIS.has(b.name) && !b.default && !b.protected,
  );
  const ordenadas = [...deRestauracao].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  return ordenadas.slice(manter);
}

export async function criarBranchRestauracao(
  opcoes: OpcoesRestauracao,
): Promise<ResultadoRestauracao> {
  const { apiKey, projeto, runId } = opcoes;
  const buscar = opcoes.buscar ?? ((u, i) => fetch(u, i));
  if (!apiKey || !projeto || !runId)
    throw new ErroNeon('Faltam NEON_API_KEY, NEON_PROJECT_ID ou GITHUB_RUN_ID.');

  const base = `/projects/${encodeURIComponent(projeto)}/branches`;
  const { branches } = await chamar<{ branches: BranchNeon[] }>(buscar, apiKey, 'GET', base);
  const pai = branches.find((b) => b.name === PAI);
  if (!pai) throw new ErroNeon(`A branch ${PAI} não existe no projeto do Neon.`);

  const nome = `${PREFIXO}${runId}`;
  const { branch: criada } = await chamar<{ branch: BranchNeon }>(buscar, apiKey, 'POST', base, {
    branch: { name: nome, parent_id: pai.id },
  });

  const sobram = paraApagar([...branches.filter((b) => b.id !== criada.id), criada]);
  const apagadas: string[] = [];
  for (const b of sobram) {
    await chamar(buscar, apiKey, 'DELETE', `${base}/${encodeURIComponent(b.id)}`);
    apagadas.push(b.name);
  }
  return { criada, apagadas };
}

if (import.meta.main) {
  await executarCli(async () => {
    const r = await criarBranchRestauracao({
      apiKey: process.env.NEON_API_KEY ?? '',
      projeto: process.env.NEON_PROJECT_ID ?? '',
      runId: process.env.GITHUB_RUN_ID ?? '',
    });
    console.log(`Branch de restauração criada: ${r.criada.name} (${r.criada.id}).`);
    for (const nome of r.apagadas) console.log(`Apagada: ${nome}.`);
  });
}
