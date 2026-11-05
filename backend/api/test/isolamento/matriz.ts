import type pg from 'pg';
import { tabelasComGrupo, type TabelaComGrupo } from './apoio.ts';

/**
 * Matriz política × comando (FUN-12, FUN-13, FUN-17): um caso por tabela com `grupo_id` e
 * por `grupos`. É a fonte única dos testes de leitura e de escrita; o meta-teste confere que
 * ela cobre exatamente as tabelas do catálogo.
 */

/**
 * `por-grupo`: `pelada_app` tem `SELECT` e a policy filtra pelos grupos visíveis.
 * `sem-grant`: `pelada_app` não tem `SELECT` (erro de permissão); só as funções e o backup leem.
 */
export type Leitura = 'por-grupo' | 'sem-grant';

export interface CasoMatriz extends TabelaComGrupo {
  leitura: Leitura;
}

export const MATRIZ: readonly CasoMatriz[] = [
  // auditoria: pelada_app só tem INSERT (1792843380000_conta-tabelas.sql).
  { tabela: 'auditoria', coluna: 'grupo_id', leitura: 'sem-grant' },
  // avisos_cobranca e push_ranking (notificacoes T7, AD-101): sem grant para pelada_app; só as funções e o backup leem.
  { tabela: 'avisos_cobranca', coluna: 'grupo_id', leitura: 'sem-grant' },
  { tabela: 'config_financeira', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'config_pesos', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'convites_admin', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'escalacoes', coluna: 'grupo_id', leitura: 'por-grupo' },
  // eventos_uso: sem grant para pelada_app (1792843260000_roles.sql).
  { tabela: 'eventos_uso', coluna: 'grupo_id', leitura: 'sem-grant' },
  { tabela: 'grupos', coluna: 'id', leitura: 'por-grupo' },
  { tabela: 'habilidades', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'jogadores', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'lancamentos', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'notas', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'pagamentos_mes', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'partidas', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'periodos_ativos', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'presencas', coluna: 'grupo_id', leitura: 'por-grupo' },
  { tabela: 'push_ranking', coluna: 'grupo_id', leitura: 'sem-grant' },
  { tabela: 'vinculos_admin', coluna: 'grupo_id', leitura: 'por-grupo' },
];

/**
 * Problemas de cobertura (FUN-12): tabela com `grupo_id` do catálogo (ou `grupos`) sem
 * `ENABLE` ou sem `FORCE ROW LEVEL SECURITY`, sem caso na matriz, ou caso da matriz sem
 * tabela no catálogo. Lista vazia = coberto.
 */
export async function problemasDeCobertura(db: pg.Client, matriz: readonly CasoMatriz[] = MATRIZ): Promise<string[]> {
  const tabelas = await tabelasComGrupo(db);
  const flags = await db.query<{ tabela: string; habilitada: boolean; forcada: boolean }>(
    `SELECT c.relname::text AS tabela, c.relrowsecurity AS habilitada, c.relforcerowsecurity AS forcada
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY ($1::text[])`,
    [tabelas.map((t) => t.tabela)],
  );
  const porTabela = new Map(flags.rows.map((l) => [l.tabela, l]));
  const casos = new Map(matriz.map((c) => [c.tabela, c]));
  const problemas: string[] = [];

  for (const { tabela, coluna } of tabelas) {
    const f = porTabela.get(tabela);
    if (!f?.habilitada) problemas.push(`${tabela}: sem ENABLE ROW LEVEL SECURITY`);
    if (!f?.forcada) problemas.push(`${tabela}: sem FORCE ROW LEVEL SECURITY`);
    const caso = casos.get(tabela);
    if (!caso) problemas.push(`${tabela}: sem caso na matriz`);
    else if (caso.coluna !== coluna) problemas.push(`${tabela}: a matriz usa a coluna ${caso.coluna}, o catálogo ${coluna}`);
  }
  const doCatalogo = new Set(tabelas.map((t) => t.tabela));
  for (const { tabela } of matriz) {
    if (!doCatalogo.has(tabela)) problemas.push(`${tabela}: caso na matriz sem tabela no catálogo`);
  }
  return problemas.sort();
}
