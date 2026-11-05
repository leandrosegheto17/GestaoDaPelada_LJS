import { join } from 'node:path';
import { arquivosDoRepositorio, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `escritores-periodo` (T45; GEL-83, GEL-111, regra de `GD:191`): só o repositório de jogadores
 * (`repositorios/jogadores.ts`) e as migrações escrevem em `periodos_ativos` e em `jogadores.inicio_pontuacao`.
 *
 * Reprova, no código da aplicação (`backend/api/src/` e `frontend/web/src/`) fora desses dois lugares:
 * - SQL `INSERT INTO`, `UPDATE` ou `DELETE FROM periodos_ativos`;
 * - Kysely `insertInto`, `updateTable` ou `deleteFrom('periodos_ativos')`;
 * - `inicio_pontuacao` atribuído num `SET` (`inicio_pontuacao =`), na lista de colunas de um `INSERT INTO jogadores`,
 *   ou como chave de um `.set({ … })` / `.values({ … })` do Kysely.
 * Ler as duas (`SELECT … FROM periodos_ativos`, `inicio_pontuacao::text`, o tipo da coluna) passa.
 *
 * SPEC_DEVIATION: o texto de `GD:191` não diz a pasta conferida; aqui é o código da aplicação. O seed
 * (`backend/scripts/src/seed.ts`) e os testes montam o cenário direto no banco e ficam fora: não são escritores do
 * produto. O nome das tabelas e da coluna é montado por partes, para este arquivo não depender da própria regra.
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');

const TABELA = ['periodos', 'ativos'].join('_');
const COLUNA = ['inicio', 'pontuacao'].join('_');

export const PASTAS_CONFERIDAS: readonly string[] = ['backend/api/src/', 'frontend/web/src/'];
export const ESCRITORES_PERMITIDOS: readonly string[] = [
  'backend/api/src/infraestrutura/db/repositorios/jogadores.ts',
];
export const PASTA_MIGRACOES = 'backend/api/src/infraestrutura/db/migracoes/';

/** Padrões sobre o arquivo inteiro (o SQL e o objeto do Kysely cruzam linhas). */
const PROIBIDOS: ReadonlyArray<[string, RegExp]> = [
  [
    `escrita SQL em ${TABELA}`,
    new RegExp(`\\b(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${TABELA}\\b`, 'gi'),
  ],
  [
    `escrita Kysely em ${TABELA}`,
    new RegExp(`\\b(insertInto|updateTable|deleteFrom)\\s*\\(\\s*['"\`]${TABELA}['"\`]`, 'g'),
  ],
  [`${COLUNA} num SET`, new RegExp(`\\b${COLUNA}\\s*=(?!=)`, 'g')],
  [
    `${COLUNA} num INSERT de jogadores`,
    new RegExp(`INSERT\\s+INTO\\s+jogadores\\s*\\([^)]*\\b${COLUNA}\\b`, 'gi'),
  ],
  [
    `${COLUNA} num set/values do Kysely`,
    new RegExp(`\\.(set|values)\\s*\\(\\s*\\{[^}]*\\b${COLUNA}\\b`, 'g'),
  ],
  [`${COLUNA} num set do Kysely`, new RegExp(`\\.set\\s*\\(\\s*['"\`]${COLUNA}['"\`]`, 'g')],
];

function linhaDe(conteudo: string, indice: number): number {
  let n = 1;
  for (let i = 0; i < indice; i += 1) if (conteudo.charCodeAt(i) === 10) n += 1;
  return n;
}

/** Uma linha por ocorrência: `caminho:linha: <motivo>`. */
export function checarEscritoresPeriodo(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho: bruto, conteudo } of arquivos) {
    const caminho = bruto.replace(/\\/g, '/');
    if (conteudo.includes('\u0000')) continue;
    if (!PASTAS_CONFERIDAS.some((p) => caminho.startsWith(p))) continue;
    if (caminho.startsWith(PASTA_MIGRACOES) || ESCRITORES_PERMITIDOS.includes(caminho)) continue;
    for (const [motivo, re] of PROIBIDOS) {
      re.lastIndex = 0;
      for (const m of conteudo.matchAll(re)) {
        problemas.push(
          `${caminho}:${linhaDe(conteudo, m.index ?? 0)}: ${motivo}; só repositorios/jogadores.ts e as migrações escrevem (GEL-83, GEL-111)`,
        );
      }
    }
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarEscritoresPeriodo(arquivosDoRepositorio(RAIZ));
  for (const p of problemas) console.error(`escritores-periodo: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
