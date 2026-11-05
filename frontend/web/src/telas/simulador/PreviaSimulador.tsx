import type { PreviaResposta } from '@pelada/contrato/simulador';
import { Botao } from '../../componentes/Botao.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { TEXTO_ERRO_PREVIA, type EstadoPrevia } from '../../dados/previas.ts';
import estilos from './simulador.module.css';

/**
 * Prévia na tela de entradas (t12; simulador T46; SIM-14, SIM-15), de `t12-simulador--{dois-times,insuficiente,
 * calculando}.html`:
 * - pendente (entre a mudança e a resposta, com o debounce do `usePreviaSimulador`): "Prévia" e "calculando…";
 * - válida: a descrição da API ("2 times de 7 · 5 reservas");
 * - inválida: a descrição da API no lugar da prévia, como erro (`#previa-erro`), e "Sugerir times" desabilitado e
 *   ligado a ela por `aria-describedby`;
 * - falha da rede: "Não foi possível calcular. Verifique a conexão." com "Tentar de novo".
 * Nada aqui calcula times (SIM-15): este arquivo não importa o domínio.
 */

export const TEXTO_CALCULANDO_PREVIA = 'calculando…';
export const ID_PREVIA_ERRO = 'previa-erro';

/** "Sugerir times" só com a prévia pronta e válida. */
export function podeSugerir(estado: EstadoPrevia<PreviaResposta>): boolean {
  return estado.tipo === 'pronta' && estado.previa.valida;
}

/** A prévia é inválida: o botão aponta para a descrição. */
export function previaInvalida(estado: EstadoPrevia<PreviaResposta>): boolean {
  return estado.tipo === 'pronta' && !estado.previa.valida;
}

interface PropsPrevia {
  estado: EstadoPrevia<PreviaResposta>;
  aoTentarDeNovo: () => void;
}

export function PreviaSimulador({ estado, aoTentarDeNovo }: PropsPrevia) {
  if (estado.tipo === 'pronta' && !estado.previa.valida) {
    return (
      <div id={ID_PREVIA_ERRO}>
        <Faixa tipo="erro">{estado.previa.descricao}</Faixa>
      </div>
    );
  }
  if (estado.tipo === 'erro') {
    return (
      <Faixa
        tipo="erro"
        acao={
          <Botao variante="texto" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      >
        {TEXTO_ERRO_PREVIA}
      </Faixa>
    );
  }
  const calculando = estado.tipo === 'calculando' || estado.tipo === 'ocioso';
  return (
    <div className={estilos.cartao} aria-live="polite" aria-busy={calculando || undefined}>
      <p className={estilos['campo__ajuda']}>Prévia</p>
      {calculando ? (
        <p className={`${estilos.previa} ${estilos.recalculando}`}>{TEXTO_CALCULANDO_PREVIA}</p>
      ) : (
        <p className={estilos.previa}>{estado.tipo === 'pronta' ? estado.previa.descricao : null}</p>
      )}
    </div>
  );
}
