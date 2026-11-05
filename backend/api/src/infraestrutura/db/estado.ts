import { readdirSync } from 'node:fs';
import type pg from 'pg';
import { TABELAS_IGNORADAS } from './esquema.ts';

/**
 * Estado do banco antes de migrar (FUN-09, FUN-10, design C2).
 *
 * Casos limite e estados:
 * - nenhuma tabela em public e sem `pgmigrations`            → vazio
 * - `pgmigrations` com as 23, na ordem                       → gerenciado (zero DDL)
 * - `pgmigrations` com as 20 primeiras (prefixo, na ordem)   → gerenciado (aplica as 3)
 * - `pgmigrations` vazia e nenhuma outra tabela              → gerenciado (prefixo vazio)
 * - nome registrado que não existe na v2                     → divergente
 * - nomes da v2 registrados fora da ordem                    → divergente
 * - tabelas sem `pgmigrations` (inclusive o legado com `migracoes_aplicadas`) → divergente
 * - `pgmigrations` vazia com tabelas                         → divergente
 * - mais nomes registrados do que arquivos                   → divergente (nome desconhecido)
 *
 * [LACUNA] A FUN-10 fala em "schema igual ao da produção"; o design (C2) define `gerenciado` só
 * pela `pgmigrations`. Segue o design (mais conservador para a produção, que tem diferenças
 * conhecidas fora do schema, como `migracoes_aplicadas` e o LOGIN das roles); a comparação do
 * schema completo com a referência fica no teste de igualdade (T21) e na paridade (T80).
 */
export type Estado = 'vazio' | 'gerenciado' | 'divergente';

export interface Deteccao {
  estado: Estado;
  /** Nomes registrados na `pgmigrations`, na ordem de aplicação. */
  registradas: string[];
  /** Só em `divergente`: o que impede migrar. */
  diferencas: string[];
}

/** Nomes das migrações de uma pasta (sem `.sql`), em ordem. */
export function listarMigracoes(pasta: string): string[] {
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => f.slice(0, -'.sql'.length));
}

async function existePgmigrations(c: pg.ClientBase): Promise<boolean> {
  const r = await c.query<{ existe: boolean }>(
    `SELECT to_regclass('public.pgmigrations') IS NOT NULL AS existe`,
  );
  return r.rows[0]?.existe === true;
}

async function tabelasDaAplicacao(c: pg.ClientBase): Promise<string[]> {
  const r = await c.query<{ nome: string }>(
    `SELECT c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'pgmigrations'
      ORDER BY 1`,
  );
  return r.rows.map((x) => x.nome);
}

export async function detectarEstado(c: pg.ClientBase, arquivos: string[]): Promise<Deteccao> {
  const tabelas = await tabelasDaAplicacao(c);

  if (!(await existePgmigrations(c))) {
    if (tabelas.length === 0) return { estado: 'vazio', registradas: [], diferencas: [] };
    const legado = tabelas.filter((t) => (TABELAS_IGNORADAS as readonly string[]).includes(t));
    return {
      estado: 'divergente',
      registradas: [],
      diferencas: [
        `tabelas sem pgmigrations: ${tabelas.join(', ')}`,
        ...(legado.length > 0
          ? [`controle de migração do legado presente: ${legado.join(', ')}`]
          : []),
      ],
    };
  }

  const r = await c.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY run_on, id');
  const registradas = r.rows.map((x) => x.name);
  const diferencas: string[] = [];

  const conhecidas = new Set(arquivos);
  for (const nome of registradas) {
    if (!conhecidas.has(nome))
      diferencas.push(`registrada na pgmigrations e sem arquivo na v2: ${nome}`);
  }
  if (diferencas.length === 0) {
    registradas.forEach((nome, i) => {
      if (arquivos[i] !== nome) {
        diferencas.push(
          `ordem diferente na posição ${i + 1}: registrada ${nome}, esperada ${arquivos[i]}`,
        );
      }
    });
  }
  if (registradas.length === 0 && tabelas.length > 0) {
    diferencas.push(`pgmigrations vazia com tabelas: ${tabelas.join(', ')}`);
  }

  return diferencas.length === 0
    ? { estado: 'gerenciado', registradas, diferencas }
    : { estado: 'divergente', registradas, diferencas };
}

export class ErroEsquemaDivergente extends Error {
  override name = 'ErroEsquemaDivergente';
  readonly diferencas: string[];
  constructor(diferencas: string[]) {
    super(
      `O banco não está vazio nem é gerenciado pela v2. Nada foi alterado. Diferenças:\n- ${diferencas.join('\n- ')}`,
    );
    this.diferencas = diferencas;
  }
}
