ALTER TABLE jogadores ADD COLUMN pontuacao_inicial integer NOT NULL DEFAULT 0 CHECK (pontuacao_inicial BETWEEN 0 AND 9999);

-- contrair: o CHECK de posição é trocado por outro que aceita a lista antiga e a nova, sem perda de dado
-- Aceita as posições novas e as antigas durante a transição; o CHECK só com as novas entra numa migração `-- contrair:` própria, em um deploy seguinte.
ALTER TABLE jogadores DROP CONSTRAINT jogadores_posicao_check;
ALTER TABLE jogadores ADD CONSTRAINT jogadores_posicao_check CHECK (
  posicao IN ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante', 'defensor', 'meio_campo')
);
UPDATE jogadores SET posicao = 'zagueiro' WHERE posicao = 'defensor';
UPDATE jogadores SET posicao = 'meia' WHERE posicao = 'meio_campo';

ALTER TABLE config_pesos ADD COLUMN expulso_com_chuva smallint NOT NULL DEFAULT -1 CHECK (expulso_com_chuva BETWEEN -10 AND 10);
UPDATE config_pesos SET expulso_com_chuva = expulso;

COMMENT ON COLUMN jogadores.pontuacao_inicial IS 'Pontos acumulados antes da primeira partida registrada (0 a 9999). Dado de negócio, sem dado pessoal; só as rotas de administração do grupo o devolvem.';
COMMENT ON COLUMN config_pesos.expulso IS 'Peso do expulso em partida sem chuva.';
COMMENT ON COLUMN config_pesos.expulso_com_chuva IS 'Peso do expulso em partida com chuva.';
