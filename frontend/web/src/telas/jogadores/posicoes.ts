import { POSICOES, type Posicao } from '@pelada/contrato/elenco';
import type { OpcaoSeletor } from '../../componentes/CampoSeletor.tsx';

/**
 * Rótulos de tela das posições do contrato (GEL-37). A ordem do seletor segue o mockup
 * (`t16-jogador--novo.html`: Zagueiro, Lateral, Volante, Meia, Atacante, Centroavante, Goleiro).
 */

export const ROTULOS_POSICAO: Record<Posicao, string> = {
  goleiro: 'Goleiro',
  zagueiro: 'Zagueiro',
  lateral: 'Lateral',
  volante: 'Volante',
  meia: 'Meia',
  atacante: 'Atacante',
  centroavante: 'Centroavante',
};

const ORDEM_DO_MOCKUP: readonly Posicao[] = ['zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante', 'goleiro'];

export const OPCOES_POSICAO: readonly OpcaoSeletor<Posicao>[] = ORDEM_DO_MOCKUP.filter((p) => POSICOES.includes(p)).map((valor) => ({
  valor,
  rotulo: ROTULOS_POSICAO[valor],
}));
