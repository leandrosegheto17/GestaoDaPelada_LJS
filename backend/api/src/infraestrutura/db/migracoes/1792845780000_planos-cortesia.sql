-- Up Migration
-- Cortesia do grupo de teste e trial dos grupos que já existem (planos-e-cobranca T17; PLA-11; S:37-38; AD-057,
-- AD-113). Migração de dados, aditiva (nenhum DDL).
-- Até aqui todo grupo é `uso_proprio` (o default da coluna, 1792843200000_linha-de-base.sql:72-78). Só o grupo de teste
-- do usuário (o slug lido na produção na T9) continua de cortesia; os demais `uso_proprio` passam a `trial` com o dia
-- de hoje em São Paulo, num só UPDATE das duas colunas (o CHECK grupos_trial exige as duas juntas). Não é função: a
-- data vem do momento da migração e não há auditoria, para a contagem de linhas de toda tabela ficar igual
-- (ensaio da T18, contagem de F:2233).
-- Casos limite (Domínio: sim):
-- - banco sem grupos (CI, banco de teste): termina sem erro e sem escrita (AD-113);
-- - há grupos e nenhum tem o slug: RAISE EXCEPTION e nada muda (a migração inteira desfaz);
-- - grupo do slug já em outra situação (`trial`, `ativo`…): não muda; só `uso_proprio` passa a `trial`;
-- - grupos que já estão em `trial`, `ativo`, `inadimplente` ou `cancelado`: não mudam;
-- - grupo `uso_proprio` arquivado: passa a `trial` como os outros (a cortesia é só do grupo de teste; reativado, segue
--   a regra do plano).
-- [LACUNA] O valor de SLUG_GRUPO_TESTE só existe depois da pausa da T9 (o usuário lê o slug na `main` do Neon): o
-- /executar troca o marcador abaixo pelo slug informado antes do primeiro `pnpm migrar` desta migração. Com o
-- marcador, um banco local com grupos (seed) aborta aqui, de propósito. O teste (T17) troca a mesma linha pelo slug do
-- cenário, pelo nome da constante.
-- SPEC_DEVIATION: timestamp escolhido à mão (1792845780000), conferido pelo /executar (S-04).
DO $$
DECLARE
  SLUG_GRUPO_TESTE constant text := 'turma-do-rola';
  v_hoje constant date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM grupos) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM grupos WHERE slug = SLUG_GRUPO_TESTE) THEN
    RAISE EXCEPTION 'planos-cortesia: nenhum grupo com o slug do grupo de teste (%); nada foi alterado', SLUG_GRUPO_TESTE;
  END IF;

  UPDATE grupos
     SET situacao_comercial = 'trial', trial_inicio = v_hoje
   WHERE situacao_comercial = 'uso_proprio'
     AND slug <> SLUG_GRUPO_TESTE;
END
$$;
