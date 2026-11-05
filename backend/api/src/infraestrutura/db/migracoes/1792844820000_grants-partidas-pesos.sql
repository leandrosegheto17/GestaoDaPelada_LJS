-- Up Migration
-- UPDATE por coluna em partidas e config_pesos (partidas-e-ranking T25; PAR-09; BD:141-143). Aditiva.
-- A linha de base dava à pelada_app UPDATE em todas as colunas das duas tabelas (1792843260000_roles.sql:22-25): um
-- bug poderia trocar a data de uma partida, a vigência de uma configuração já usada no ranking, a autoria da criação
-- ou o grupo da linha. O runtime passa a alterar só o que a edição muda: a chuva e a autoria da alteração na partida,
-- e os 6 pesos com a autoria do registro na configuração do dia (o ON CONFLICT ... DO UPDATE do salvar). Data e
-- vigência ficam imutáveis no banco. DELETE em config_pesos continua sem grant (a linha de base nunca deu).
-- Molde: 1792844400000_grupos-grants-coluna.sql:6-7.
REVOKE UPDATE ON partidas, config_pesos FROM pelada_app;
GRANT UPDATE (choveu, alterada_por, alterada_em) ON partidas TO pelada_app;
GRANT UPDATE (presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva, lesionado_com_chuva, expulso,
              expulso_com_chuva, registrado_por, registrado_em) ON config_pesos TO pelada_app;
