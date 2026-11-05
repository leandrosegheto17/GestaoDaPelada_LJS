import type { SugerirCorpo } from '@pelada/contrato/simulador';
import { useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import type { CorpoEscalacao } from '../../dados/simulador.ts';
import { corpoDoAvaliar, type ResultadoNaTela } from './MoverJogador.tsx';
import estilos from './simulador.module.css';

/**
 * Ações do resultado (t13, t14; simulador T50; SIM-46, SIM-66, SIM-73, SIM-93), de
 * `.specs/mockup/telas/t13-resultado-dois--{sucesso,refazer,erro-confirmar}.html`:
 * - "Confirmar escalação" sempre ativo, mesmo com avisos (SIM-46): grava a composição na tela; o sucesso volta ao
 *   início com "Escalação de dd/mm confirmada."; a falha (inclusive 409 de grupo arquivado, SIM-93) mantém a
 *   composição e mostra "Não foi possível confirmar a escalação. Tente de novo." (SIM-73);
 * - "Refazer sugestão": sem ajuste, pede outra sugestão direto; com ajuste, pergunta "Descartar seus ajustes?" com
 *   "A sugestão será refeita do zero com as mesmas entradas.", "Cancelar" e "Refazer sugestão" (SIM-66);
 * - "Editar entradas" volta à t12 com as entradas como estavam (SIM-66).
 */

export const TEXTO_FALHA_CONFIRMAR = 'Não foi possível confirmar a escalação. Tente de novo.';
export const TITULO_DESCARTAR = 'Descartar seus ajustes?';
export const TEXTO_DESCARTAR = 'A sugestão será refeita do zero com as mesmas entradas.';

/** "2026-10-22" → "Escalação de 22/10 confirmada." */
export function avisoEscalacaoConfirmada(data: string): string {
  const [, mes, dia] = data.split('-');
  return `Escalação de ${dia}/${mes} confirmada.`;
}

/** O corpo de `POST …/escalacoes`: a entrada da sugestão sem os aptos, com a composição na tela (SIM-67, SIM-72). */
export function corpoDaEscalacao(
  entrada: SugerirCorpo,
  composicao: ResultadoNaTela,
): CorpoEscalacao {
  const { aptos: _aptos, ...semAptos } = corpoDoAvaliar(entrada, composicao);
  return semAptos as CorpoEscalacao;
}

export function FalhaConfirmar() {
  return <Faixa tipo="erro">{TEXTO_FALHA_CONFIRMAR}</Faixa>;
}

interface PropsAcoes {
  ajustado: boolean;
  confirmando: boolean;
  aoConfirmar: () => void;
  aoRefazer: () => void;
  aoEditar: () => void;
}

export function AcoesResultado({
  ajustado,
  confirmando,
  aoConfirmar,
  aoRefazer,
  aoEditar,
}: PropsAcoes) {
  const [perguntando, setPerguntando] = useState(false);
  return (
    <>
      <div className={estilos['barra-acao']}>
        <div className={estilos['grupo-botoes']}>
          <Botao variante="principal" carregando={confirmando} onClick={aoConfirmar}>
            Confirmar escalação
          </Botao>
          <Botao
            variante="secundario"
            onClick={() => (ajustado ? setPerguntando(true) : aoRefazer())}
          >
            Refazer sugestão
          </Botao>
          <Botao variante="texto" onClick={aoEditar}>
            Editar entradas
          </Botao>
        </div>
      </div>
      {perguntando ? (
        <Dialogo
          alerta
          titulo={TITULO_DESCARTAR}
          descricao={TEXTO_DESCARTAR}
          aoFechar={() => setPerguntando(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setPerguntando(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="destrutivo"
                onClick={() => {
                  setPerguntando(false);
                  aoRefazer();
                }}
              >
                Refazer sugestão
              </Botao>
            </>
          }
        />
      ) : null}
    </>
  );
}
