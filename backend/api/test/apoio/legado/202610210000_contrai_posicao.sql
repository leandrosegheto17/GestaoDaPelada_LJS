-- contrair: o CHECK de posição passa a aceitar só as 7 posições do contrato; as antigas já foram convertidas
UPDATE jogadores SET posicao = 'zagueiro' WHERE posicao = 'defensor';
UPDATE jogadores SET posicao = 'meia' WHERE posicao = 'meio_campo';
ALTER TABLE jogadores DROP CONSTRAINT jogadores_posicao_check;
ALTER TABLE jogadores ADD CONSTRAINT jogadores_posicao_check CHECK (
  posicao IN ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante')
);
