/** Prefixo das branches de restauração; só as que têm este prefixo podem ser apagadas. */
export const PREFIXO = 'restauracao-';
/** Quantas branches de restauração ficam depois de cada deploy (a recém-criada e a anterior). */
export const MANTER = 2;

const API = 'https://console.neon.tech/api/v2';
const NUNCA_APAGAR = new Set(['main', 'dev']);

interface BranchNeon {
  id: string;
  name: string;
  created_at: string;
  default?: boolean;
  protected?: boolean;
}

export interface OpcoesRestauracao {
  projeto: string;
  chave: string;
  /** Identificador da execução do workflow (`GITHUB_RUN_ID`); vira o nome da branch. */
  runId: string;
  /** Nome da branch de origem (padrão `main`, AD-119). */
  pai?: string;
  fetch?: typeof fetch;
}

export interface ResultadoRestauracao {
  criada: string;
  apagadas: string[];
}

/** Chama a API do Neon; o erro cita o método, o caminho e o status, nunca a chave. */
async function chamar(
  f: typeof fetch,
  chave: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<unknown> {
  const r = await f(`${API}${caminho}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${chave}`,
      accept: 'application/json',
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  if (!r.ok) {
    throw new Error(`Neon: ${metodo} ${caminho} respondeu ${r.status}`);
  }
  return r.json();
}

/**
 * Cria `restauracao-<run_id>` a partir da `main` pela API do Neon e mantém só as `MANTER` mais recentes (FUN-42). Se o
 * deploy corromper o banco, a branch criada antes da migração é o ponto de volta. Nunca apaga `main`, `dev`, a branch
 * padrão, as protegidas nem as que não começam com o prefixo; qualquer erro da API interrompe.
 */
export async function criarBranchDeRestauracao(
  op: OpcoesRestauracao,
): Promise<ResultadoRestauracao> {
  for (const [nome, valor] of [
    ['projeto', op.projeto],
    ['chave', op.chave],
    ['runId', op.runId],
  ] as const) {
    if (!valor) throw new Error(`Parâmetro ausente: ${nome}`);
  }
  const f = op.fetch ?? fetch;
  const pai = op.pai ?? 'main';
  const caminho = `/projects/${encodeURIComponent(op.projeto)}/branches`;
  const listar = async () =>
    ((await chamar(f, op.chave, 'GET', caminho)) as { branches: BranchNeon[] }).branches;

  const origem = (await listar()).find((b) => b.name === pai);
  if (!origem) throw new Error(`Branch de origem "${pai}" não encontrada no projeto Neon`);

  const nome = `${PREFIXO}${op.runId}`;
  await chamar(f, op.chave, 'POST', caminho, { branch: { name: nome, parent_id: origem.id } });

  const restauracoes = (await listar())
    .filter(
      (b) => b.name.startsWith(PREFIXO) && !NUNCA_APAGAR.has(b.name) && !b.default && !b.protected,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const sobra = restauracoes.slice(MANTER).reverse();
  const apagadas: string[] = [];
  for (const b of sobra) {
    await chamar(f, op.chave, 'DELETE', `${caminho}/${encodeURIComponent(b.id)}`);
    apagadas.push(b.name);
  }
  return { criada: nome, apagadas };
}

if (import.meta.main) {
  criarBranchDeRestauracao({
    projeto: process.env.NEON_PROJECT_ID ?? '',
    chave: process.env.NEON_API_KEY ?? '',
    runId: process.env.GITHUB_RUN_ID ?? '',
  }).then(
    (r) => {
      console.log(`Branch de restauração criada: ${r.criada}`);
      if (r.apagadas.length > 0) console.log(`Apagadas: ${r.apagadas.join(', ')}`);
    },
    (e) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
