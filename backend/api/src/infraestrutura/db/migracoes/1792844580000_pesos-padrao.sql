-- Up Migration
-- Pesos padrão para os grupos sem configuração (partidas-e-ranking T21; PAR-13, PAR-14; BD:120-124). Aditiva.
-- Todo grupo sem linha em config_pesos ganha 1, 1, 1, 1, -1, -1 (presença e lesionado, sem e com chuva; expulso sem e
-- com chuva), vigentes desde o dia da criação do grupo em São Paulo, registrados pela criadora no momento da criação.
-- Converte um momento já gravado (grupos.criado_em) e não lê o relógio (AD-015). Grupo que já tem configuração fica
-- intacto; grupo arquivado também recebe (o SQL da Base não os separa). Idempotente: rodar de novo não insere nada.
-- SPEC_DEVIATION: o timestamp (1792844580000) é o primeiro depois do 1792844520000; a grupos-e-elenco v2 não tem
-- migração nova, e o financeiro (1792845300000) deixou a folga para as features 4 e 5.
INSERT INTO config_pesos (
  grupo_id,
  vigente_desde,
  presenca_sem_chuva,
  presenca_com_chuva,
  lesionado_sem_chuva,
  lesionado_com_chuva,
  expulso,
  expulso_com_chuva,
  registrado_por,
  registrado_em
)
SELECT g.id, (g.criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 1, 1, 1, 1, -1, -1, g.criado_por, g.criado_em
  FROM grupos g
 WHERE NOT EXISTS (SELECT 1 FROM config_pesos c WHERE c.grupo_id = g.id);
