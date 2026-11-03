-- Up Migration
-- UPDATE por coluna em grupos (grupos-e-elenco, design C1; GEL-16, GEL-112). A linha de base dava à pelada_app UPDATE
-- em todas as colunas de grupos (1792843260000_roles.sql); um bug poderia trocar criado_por (quem arquiva e reativa,
-- C3), situacao_comercial ou trial_inicio (planos-e-cobranca). O runtime passa a alterar só os dados que o admin edita
-- e a marca de arquivamento. O slug continua imutável também pela trigger grupos_slug_imutavel (linha de base).
REVOKE UPDATE ON grupos FROM pelada_app;
GRANT UPDATE (nome, dia_semana, frequencia, horario, arquivado_em) ON grupos TO pelada_app;
