import { readFileSync } from 'node:fs';

type BranchNeon = { id: string; name: string; created_at: string };

/** Lê a lista de branches de GET /projects/{id}/branches. Qualquer outro formato lança (sem ecoar o corpo). */
function lerBranches(corpo: string): BranchNeon[] {
  let resposta: unknown;
  try {
    resposta = JSON.parse(corpo);
  } catch {
    throw new Error('Resposta da API do Neon não é JSON.');
  }
  const branches = (resposta as { branches?: unknown } | null)?.branches;
  if (!Array.isArray(branches)) throw new Error('Resposta da API do Neon sem a lista de branches.');
  for (const branch of branches as Array<Partial<BranchNeon> | null>) {
    if (typeof branch?.name !== 'string') throw new Error('Branch do Neon sem nome na resposta.');
  }
  return branches as BranchNeon[];
}

/** Id do branch com o nome exato `nome` (o primeiro, se repetido). Lança quando ele não existe: falha fechado. */
export function idDoBranchPai(corpo: string, nome: string): string {
  const pai = lerBranches(corpo).find((branch) => branch.name === nome);
  if (!pai) throw new Error('Branch pai não encontrado na resposta do Neon.');
  return pai.id;
}

/**
 * Ids dos branches `restauracao-<ambiente>-*` a apagar: todos menos os `manter` mais novos por `created_at`.
 * Só considera nomes com esse prefixo, então o branch `production` e os de outros ambientes nunca saem.
 */
export function branchesAntigos(corpo: string, ambiente: string, manter = 2): string[] {
  const prefixo = `restauracao-${ambiente}-`;
  return lerBranches(corpo)
    .filter((branch) => branch.name.startsWith(prefixo))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(manter)
    .map((branch) => branch.id);
}

const USO = 'Uso: curl ... | node restauracao-neon-cli.ts (pai <nome> | antigos <ambiente>) --executar';

/** Lê a resposta do Neon em stdin e imprime o id do pai ou um id por linha; devolve o código de saída. */
export function main(argv: readonly string[], lerStdin: () => string = () => readFileSync(0, 'utf8')): number {
  const [comando, valor] = argv;
  if (!argv.includes('--executar') || !valor || valor === '--executar') {
    console.error(USO);
    return 1;
  }
  try {
    if (comando === 'pai') {
      console.log(idDoBranchPai(lerStdin(), valor));
    } else if (comando === 'antigos') {
      for (const id of branchesAntigos(lerStdin(), valor)) console.log(id);
    } else {
      console.error(USO);
      return 1;
    }
    return 0;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}
