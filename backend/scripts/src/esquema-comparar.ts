import { readFileSync } from 'node:fs';
import pg from 'pg';
import {
  ARQUIVO_ESQUEMA_PRODUCAO,
  lerEsquema,
  ROLES_DA_APLICACAO,
} from '../../api/src/infraestrutura/db/esquema.ts';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';
import { PERMISSAO_HOST_REMOTO } from './migrar.ts';

export interface Diferencas {
  /** Linhas da referência que o banco não tem. */
  faltando: string[];
  /** Linhas do banco que a referência não tem. */
  sobrando: string[];
}

/** Compara duas impressões digitais do schema (FUN-08); função pura. */
export function compararLinhas(
  referencia: readonly string[],
  atual: readonly string[],
): Diferencas {
  const ref = new Set(referencia);
  const cur = new Set(atual);
  return {
    faltando: [...ref].filter((l) => !cur.has(l)).sort(),
    sobrando: [...cur].filter((l) => !ref.has(l)).sort(),
  };
}

/** Lê o esquema do banco pela URL, numa transação somente leitura. */
export async function lerEsquemaDoBanco(url: string): Promise<string[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('begin read only');
    const linhas = await lerEsquema(c, { roles: ROLES_DA_APLICACAO });
    await c.query('rollback');
    return linhas;
  } finally {
    await c.end();
  }
}

/** Contagem de linhas por tabela do schema `public` (FUN-09), em transação somente leitura. */
export async function contarLinhas(url: string): Promise<Record<string, number>> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('begin read only');
    const { rows } = await c.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    );
    const contagem: Record<string, number> = {};
    for (const { tablename } of rows) {
      const r = await c.query<{ n: number }>(
        `select count(*)::int as n from "public"."${tablename}"`,
      );
      contagem[tablename] = r.rows[0]!.n;
    }
    await c.query('rollback');
    return contagem;
  } finally {
    await c.end();
  }
}

export function compararContagens(
  antes: Record<string, number>,
  depois: Record<string, number>,
): string[] {
  const nomes = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort();
  return nomes
    .filter((t) => antes[t] !== depois[t])
    .map((t) => `${t}: ${antes[t] ?? 'ausente'} -> ${depois[t] ?? 'ausente'}`);
}

export type Alvo = 'local' | 'dev';

/**
 * Escolhe a URL do alvo. Só `local` e `dev` existem: a `main` do Neon (produção) nunca é alvo, em ensaio nem em
 * leitura (AD-032, AD-033). `dev` exige a permissão de host remoto, a mesma do deploy (FUN-19).
 */
export function urlDoAlvo(alvo: string, env: NodeJS.ProcessEnv): string {
  if (alvo === 'local') {
    const url = env.DATABASE_URL_MIGRACAO;
    if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO (veja o .env.example).');
    exigirHostPermitido(url, HOSTS_LOCAIS);
    return url;
  }
  if (alvo === 'dev') {
    const url = env.NEON_URL_DEV_MIGRACAO;
    if (!url)
      throw new Error('Defina NEON_URL_DEV_MIGRACAO no .env (URL da role dona da branch dev).');
    if (env[PERMISSAO_HOST_REMOTO] !== '1') {
      throw new Error(`Alvo dev é remoto: defina ${PERMISSAO_HOST_REMOTO}=1 para confirmar.`);
    }
    return url;
  }
  throw new Error(`Alvo "${alvo}" não permitido. Alvos: local, dev.`);
}

export interface RelatorioParidade {
  diferencas: Diferencas;
  /** Só com `migrar`: DDL aplicado pela migração (diferenças entre antes e depois) e linhas que mudaram. */
  ddlDaMigracao?: Diferencas;
  contagemMudou?: string[];
  migracoesAplicadas?: string[];
}

/** Compara o banco com a referência; com `rodarMigrar`, migra e confere zero DDL e a mesma contagem (FUN-09). */
export async function conferirParidade(
  url: string,
  opcoes: { referencia?: readonly string[]; rodarMigrar?: boolean } = {},
): Promise<RelatorioParidade> {
  const referencia =
    opcoes.referencia ??
    readFileSync(ARQUIVO_ESQUEMA_PRODUCAO, 'utf8')
      .split('\n')
      .filter((l) => l !== '');
  const antes = await lerEsquemaDoBanco(url);
  const relatorio: RelatorioParidade = { diferencas: compararLinhas(referencia, antes) };
  if (opcoes.rodarMigrar) {
    const contagemAntes = await contarLinhas(url);
    relatorio.migracoesAplicadas = await migrar(url);
    const depois = await lerEsquemaDoBanco(url);
    relatorio.ddlDaMigracao = compararLinhas(antes, depois);
    relatorio.contagemMudou = compararContagens(contagemAntes, await contarLinhas(url));
  }
  return relatorio;
}

function imprimir(r: RelatorioParidade): boolean {
  const { faltando, sobrando } = r.diferencas;
  console.log(
    `Diferenças contra a referência: ${faltando.length} faltando, ${sobrando.length} sobrando`,
  );
  for (const l of faltando) console.log(`  - falta: ${l}`);
  for (const l of sobrando) console.log(`  + sobra: ${l}`);
  let ok = faltando.length === 0 && sobrando.length === 0;
  if (r.ddlDaMigracao && r.contagemMudou && r.migracoesAplicadas) {
    const ddl = r.ddlDaMigracao.faltando.length + r.ddlDaMigracao.sobrando.length;
    console.log(
      `Migração: ${r.migracoesAplicadas.length} aplicada(s); DDL: ${ddl} linha(s); contagens alteradas: ${r.contagemMudou.length}`,
    );
    for (const l of r.contagemMudou) console.log(`  ~ ${l}`);
    ok = ok && ddl === 0 && r.contagemMudou.length === 0 && r.migracoesAplicadas.length === 0;
  }
  return ok;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--alvo');
  const alvo = i >= 0 ? (args[i + 1] ?? '') : 'local';
  try {
    const url = urlDoAlvo(alvo, process.env);
    const r = await conferirParidade(url, { rodarMigrar: args.includes('--migrar') });
    process.exit(imprimir(r) ? 0 : 1);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
}
