import type { JogadorDetalhe } from '@pelada/contrato';
import { useState } from 'react';
import { Botao } from '../../componentes/basicos/Botao';
import { classesBotao } from '../../componentes/basicos/classesBotao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { CampoData } from '../../componentes/campos/CampoData';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { useAlterarInicio, useCorrigirPeriodo, type CorpoCorrigirPeriodo } from '../../dados/elenco';
import { deErroApi } from '../../dados/errosDeCampos';
import { dataCompleta, hojeEmSaoPaulo } from '../../formatacao';
import estilos from './PeriodosJogador.module.css';

type Periodo = JogadorDetalhe['periodos'][number];

const NADA_A_ALTERAR = 'Nada a alterar.';

const intervalo = (p: Periodo) => (
  <>
    {dataCompleta(p.inicio)} <span aria-hidden="true">→</span>
    <span className="sr">até</span> {p.fim ? dataCompleta(p.fim) : 'atual'}
  </>
);

interface PropsCorrigir {
  grupoId: string;
  jogador: JogadorDetalhe;
  periodo: Periodo;
  /** Posição do período na lista (0 = a entrada, cujo início é a data de início da pontuação). */
  indice: number;
  aoFechar: () => void;
  aoCorrigido: () => void;
}

/**
 * Diálogo "Corrigir datas" (t16 corrigir, corrigir-saida e corrigir-erro, GEL-71): a saída dos períodos encerrados e o
 * retorno dos que não são o primeiro. Só o que mudou é enviado; sem mudança, "Nada a alterar." e Confirmar fica
 * desabilitado. A recusa da API aparece no campo da data (GEL-72, GEL-73). Sem as prévias de acumulado (C7).
 */
function DialogoCorrigir({ grupoId, jogador, periodo, indice, aoFechar, aoCorrigido }: PropsCorrigir) {
  const [hoje] = useState(hojeEmSaoPaulo);
  const [saida, setSaida] = useState(periodo.fim ?? '');
  const [retorno, setRetorno] = useState(periodo.inicio);
  const corrigir = useCorrigirPeriodo(grupoId, jogador.id);
  const erros = deErroApi(corrigir.error);
  const falhaDeEnvio = corrigir.isError && erros === null;

  const comRetorno = indice > 0;
  const comSaida = periodo.fim !== null;
  const saidaAnterior = indice > 0 ? (jogador.periodos[indice - 1]?.fim ?? null) : null;
  const inicioDoProximo = jogador.periodos[indice + 1]?.inicio ?? null;

  const corpo: CorpoCorrigirPeriodo = {
    ...(comSaida && saida !== '' && saida !== periodo.fim ? { saida } : {}),
    ...(comRetorno && retorno !== '' && retorno !== periodo.inicio ? { retorno } : {}),
  };
  const semMudanca = Object.keys(corpo).length === 0;
  const rotuloPeriodo = indice === 0 ? 'Entrada' : 'Retorno';

  const mudou = (alterar: () => void) => {
    corrigir.reset();
    alterar();
  };
  const confirmar = () =>
    corrigir.mutate(
      { periodoId: periodo.id, ...corpo },
      {
        onSuccess: (resposta) => {
          if (!resposta.alterado) return;
          aoFechar();
          aoCorrigido();
        },
      },
    );

  return (
    <Dialogo
      titulo="Corrigir datas"
      descricao={
        <>
          {rotuloPeriodo} de {jogador.apelido}: {intervalo(periodo)}.
          {indice === 0
            ? ' A entrada é a data de início da pontuação; para mudá-la, use Alterar data de início.'
            : null}
        </>
      }
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            carregando={corrigir.isPending}
            rotuloCarregando="Corrigindo…"
            disabled={semMudanca || Boolean(erros)}
            onClick={confirmar}
          >
            Confirmar novas datas
          </Botao>
        </>
      }
    >
      {comRetorno ? (
        <CampoData
          id="retorno"
          rotulo="Data de retorno"
          max={hoje}
          ajuda={`Ele volta a aparecer nas partidas a partir desta data.${
            saidaAnterior ? ` Não pode ser antes da saída anterior (${dataCompleta(saidaAnterior)}).` : ''
          }`}
          erro={erros?.['retorno']}
          valor={retorno}
          aoMudar={(v) => mudou(() => setRetorno(v))}
        />
      ) : null}
      {comSaida ? (
        <CampoData
          id="saida"
          rotulo="Data de saída"
          max={hoje}
          ajuda={`Ele deixa de aparecer nas partidas a partir desta data.${
            inicioDoProximo ? ` Não pode ser depois do próximo retorno (${dataCompleta(inicioDoProximo)}).` : ''
          }`}
          erro={erros?.['saida']}
          valor={saida}
          aoMudar={(v) => mudou(() => setSaida(v))}
        />
      ) : null}
      <div aria-live="polite">
        <p className="paragrafo">{semMudanca || (corrigir.data && !corrigir.data.alterado) ? NADA_A_ALTERAR : null}</p>
      </div>
      {falhaDeEnvio ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

interface PropsBotao {
  grupoId: string;
  jogador: JogadorDetalhe;
  periodo: Periodo;
  indice: number;
  aoCorrigido: () => void;
}

/**
 * "Corrigir datas" de um período (t16 periodos). O primeiro período ainda aberto não tem nada a corrigir: a entrada é
 * a data de início da pontuação, e o botão aponta o caminho "Alterar data de início".
 */
export function CorrigirDatas({ grupoId, jogador, periodo, indice, aoCorrigido }: PropsBotao) {
  const [aberto, setAberto] = useState(false);
  const nadaACorrigir = indice === 0 && periodo.fim === null;
  const idExplicacao = `expl-${periodo.id}`;
  return (
    <>
      {nadaACorrigir ? (
        <>
          <button
            type="button"
            className={classesBotao({ variante: 'secundario' })}
            aria-disabled="true"
            aria-describedby={idExplicacao}
          >
            Corrigir datas
          </button>
          <span className="sr" id={idExplicacao}>
            Nada a corrigir: a data de entrada é a data de início da pontuação (use Alterar data de início).
          </span>
        </>
      ) : (
        <Botao variante="secundario" onClick={() => setAberto(true)}>
          Corrigir datas
        </Botao>
      )}
      {aberto ? (
        <DialogoCorrigir
          grupoId={grupoId}
          jogador={jogador}
          periodo={periodo}
          indice={indice}
          aoFechar={() => setAberto(false)}
          aoCorrigido={aoCorrigido}
        />
      ) : null}
    </>
  );
}

interface PropsInicio {
  grupoId: string;
  jogador: JogadorDetalhe;
  aoAlterado: () => void;
}

function DialogoInicio({ grupoId, jogador, aoFechar, aoAlterado }: PropsInicio & { aoFechar: () => void }) {
  const [hoje] = useState(hojeEmSaoPaulo);
  const [data, setData] = useState(jogador.inicioPontuacao);
  const alterar = useAlterarInicio(grupoId, jogador.id);
  const erroDaData = deErroApi(alterar.error)?.['data'];
  const falhaDeEnvio = alterar.isError && !erroDaData;
  const igual = data === jogador.inicioPontuacao;
  return (
    <Dialogo
      titulo="Alterar data de início"
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            carregando={alterar.isPending}
            rotuloCarregando="Alterando…"
            disabled={igual || data === '' || Boolean(erroDaData)}
            onClick={() =>
              alterar.mutate(
                { data },
                {
                  onSuccess: () => {
                    aoFechar();
                    aoAlterado();
                  },
                },
              )
            }
          >
            Confirmar nova data
          </Botao>
        </>
      }
    >
      <CampoData
        id="inicio"
        rotulo="Data de início"
        max={hoje}
        ajuda="A pontuação do jogador conta a partir desta data. Nada é apagado: voltar a data devolve os pontos."
        erro={erroDaData}
        valor={data}
        aoMudar={(v) => {
          alterar.reset();
          setData(v);
        }}
      />
      <div aria-live="polite">
        <p className="paragrafo">{igual ? NADA_A_ALTERAR : null}</p>
      </div>
      {falhaDeEnvio ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

/** Data de início da pontuação e o caminho "Alterar data de início" (t16 edição, GEL-76, GEL-77). */
export function DataDeInicio({ grupoId, jogador, aoAlterado }: PropsInicio) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={estilos.campo}>
      <span className={estilos.rotulo}>Data de início</span>
      <p className="paragrafo" id="inicio-valor">
        {dataCompleta(jogador.inicioPontuacao)}
      </p>
      <div>
        <Botao variante="secundario" aria-describedby="inicio-valor" onClick={() => setAberto(true)}>
          Alterar data de início
        </Botao>
      </div>
      {aberto ? (
        <DialogoInicio grupoId={grupoId} jogador={jogador} aoFechar={() => setAberto(false)} aoAlterado={aoAlterado} />
      ) : null}
    </div>
  );
}
