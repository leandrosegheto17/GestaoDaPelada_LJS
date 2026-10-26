ALTER TABLE jogadores ADD COLUMN inicio_pontuacao date;

-- Preenchimento: o que já era contado passa a ser a data de início, sem mudar nenhum acumulado.
-- É a menor entre o início do primeiro período e a primeira presença; antes da migração as presenças
-- anteriores ao período já somavam, e a pontuação inicial só valia até a primeira presença.
UPDATE jogadores j
SET inicio_pontuacao = LEAST(
  (SELECT min(p.inicio) FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.grupo_id = j.grupo_id),
  (SELECT min(pa.data) FROM presencas pr
     JOIN partidas pa ON pa.id = pr.partida_id AND pa.grupo_id = pr.grupo_id
    WHERE pr.jogador_id = j.id AND pr.grupo_id = j.grupo_id)
)
WHERE EXISTS (SELECT 1 FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.grupo_id = j.grupo_id);

-- Só o primeiro período de quem tinha presença anterior a ele recua até a data de início; períodos
-- encerrados e datas de saída seguem como estão.
UPDATE periodos_ativos p
SET inicio = j.inicio_pontuacao
FROM jogadores j
WHERE j.id = p.jogador_id AND j.grupo_id = p.grupo_id
  AND j.inicio_pontuacao < p.inicio
  AND p.inicio = (SELECT min(q.inicio) FROM periodos_ativos q WHERE q.jogador_id = p.jogador_id AND q.grupo_id = p.grupo_id);

COMMENT ON COLUMN jogadores.inicio_pontuacao IS 'Data a partir da qual as partidas do jogador contam pontos. Nula = início do primeiro período. Dado de negócio, sem dado pessoal.';
