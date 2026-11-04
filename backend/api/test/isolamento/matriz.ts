/**
 * Fonte única da matriz política × comando: os testes de leitura (T29) e de escrita (T30) iteram por
 * estes casos, e o meta-teste (T28) confere que a lista cobre toda tabela com `grupo_id` do catálogo.
 * `leitura`: 'rls' = `pelada_app` tem SELECT e a RLS filtra; 'sem-grant' = sem GRANT para `pelada_app`.
 */
export interface CasoDaMatriz {
  tabela: string;
  coluna: 'id' | 'grupo_id';
  leitura: 'rls' | 'sem-grant';
}

export const CASOS_DA_MATRIZ: readonly CasoDaMatriz[] = [
  { tabela: 'auditoria', coluna: 'grupo_id', leitura: 'sem-grant' },
  { tabela: 'config_financeira', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'config_pesos', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'convites_admin', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'escalacoes', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'eventos_uso', coluna: 'grupo_id', leitura: 'sem-grant' },
  { tabela: 'grupos', coluna: 'id', leitura: 'rls' },
  { tabela: 'habilidades', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'jogadores', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'lancamentos', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'notas', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'pagamentos_mes', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'partidas', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'periodos_ativos', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'presencas', coluna: 'grupo_id', leitura: 'rls' },
  { tabela: 'vinculos_admin', coluna: 'grupo_id', leitura: 'rls' },
];
