import type { JogadorDetalhe, PeriodoItem } from '@pelada/contrato/elenco';
import { PISO_DATA_ENTRADA } from '@pelada/contrato/elenco';
import { ehDataReal, formatarData } from '@pelada/dominio';
import { useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { PreviaInicio, PreviaPeriodos } from '../../componentes/PreviaPeriodos.tsx';
import { useAlterarInicio, useCorrigirPeriodo } from '../../dados/elenco.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import { usePedirPrevias, usePrevia } from '../../dados/previas.ts';
import listas from '../../componentes/Lista.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import {
  BlocoPrevia,
  erroDePeriodo,
  recusaDaPrevia,
  textoRodadasConfirmadas,
} from './PeriodosJogador.tsx';

/**
 * Corrigir as datas de um período e alterar a data de início, na ficha do jogador (GEL-71 a GEL-82,
 * GEL-114), de `t16-jogador--corrigir`, `--corrigir-erro`, `--corrigido`, `--inicio` e
 * `--inicio-erro` do mockup do módulo, sem prévia (C7):
 * - cada período tem "Corrigir datas": o primeiro ("Entrada") só corrige a saída, porque a entrada
 *   é a data de início da pontuação; aberto, ele não tem o que corrigir e o botão fica
 *   `aria-disabled` com a explicação; os outros ("Retorno") corrigem o retorno e, se encerrados,
 *   a saída. Confirmado, `PATCH …/periodos/:periodoId` com os campos do diálogo e a faixa
 *   "Datas corrigidas." (GEL-76);
 * - "Alterar data de início": `PUT …/inicio` com a data nova (GEL-77) e a faixa com a data;
 * - os 422 de período ficam no campo (`mensagens.saida`, `.retorno` ou `.data`; sem campo, no
 *   primeiro campo do diálogo); o resto, na faixa do diálogo.
 *
 * Prévia (partidas-e-ranking T66; PAR-120, PAR-121), do mockup do módulo da partidas-e-ranking
 * (`t16-jogador--corrigir-{previa,calculando,erro-rede}.html`, `--corrigido`, `--inicio-{recuar,avancar,calculando,
 * erro-rede}.html`): nos dois diálogos a prévia é pedida 300 ms depois da última troca de data (`BlocoPrevia`), com
 * "Calculando…" e o botão de confirmar desabilitado até ela voltar sem erro; a recusa da prévia fica no campo. A
 * correção confirmada com rodadas que passam a constar mostra "N rodadas passaram a constar: …" com "Abrir partidas".
 * (O "sem prévia (C7)" da grupos-e-elenco deixa de valer.)
 */

export const TEXTO_DATAS_CORRIGIDAS = 'Datas corrigidas.';
export const textoInicioAlterado = (data: string) =>
  `Data de início alterada para ${formatarData(data)}.`;
export const TEXTO_NADA_A_CORRIGIR =
  'Nada a corrigir: a data de entrada é a data de início da pontuação (use Alterar data de início).';
export const AJUDA_INICIO =
  'A pontuação do jogador conta a partir desta data. Nada é apagado: voltar a data devolve os pontos.';
export const textoInicioAtual = (apelido: string, data: string) =>
  `Data de início atual de ${apelido}: ${formatarData(data)}.`;

export function textoDoPeriodo(apelido: string, periodo: PeriodoItem, indice: number): string {
  const intervalo = `${formatarData(periodo.inicio)} → ${periodo.fim === null ? 'atual' : formatarData(periodo.fim)}`;
  if (indice === 0) {
    return `Entrada de ${apelido}: ${intervalo}. A entrada é a data de início da pontuação; para mudá-la, use Alterar data de início.`;
  }
  return `Retorno de ${apelido}: ${intervalo}.`;
}

export function ajudaSaida(proximoRetorno: string | null): string {
  const base = 'Ele deixa de aparecer nas partidas a partir desta data.';
  return proximoRetorno === null
    ? base
    : `${base} Não pode ser depois do próximo retorno (${formatarData(proximoRetorno)}).`;
}

export function ajudaRetornoCorrecao(saidaAnterior: string | null): string {
  const base = 'Ele volta a aparecer nas partidas a partir desta data.';
  return saidaAnterior === null
    ? base
    : `${base} Não pode ser antes da saída anterior (${formatarData(saidaAnterior)}).`;
}

export function CorrigirPeriodo({
  grupoId,
  ficha,
  periodo,
  indice,
  avisar,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  periodo: PeriodoItem;
  indice: number;
  avisar: (texto: string | null) => void;
}) {
  const corrigir = useCorrigirPeriodo(grupoId, ficha.id);
  const [aberto, setAberto] = useState(false);
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [retorno, setRetorno] = useState(periodo.inicio);
  const [saida, setSaida] = useState(periodo.fim ?? '');
  const [erros, setErros] = useState<{ retorno?: string; saida?: string }>({});
  const [falha, setFalha] = useState<string | undefined>(undefined);

  const comRetorno = indice > 0;
  const comSaida = periodo.fim !== null;
  const idTitulo = `p${indice + 1}-t`;
  const previas = usePedirPrevias(grupoId, ficha.id);
  const [rodadas, setRodadas] = useState<string | null>(null);
  const dadosPrevia: { retorno?: string; saida?: string } = {};
  if (comRetorno) dadosPrevia.retorno = retorno;
  if (comSaida) dadosPrevia.saida = saida;
  const datasValidas = (!comRetorno || ehDataReal(retorno)) && (!comSaida || ehDataReal(saida));
  const { estado, tentarDeNovo } = usePrevia(
    aberto && (comRetorno || comSaida) && datasValidas
      ? () => previas.periodo(periodo.id, dadosPrevia)
      : null,
    `${aberto ? 'aberto' : 'fechado'}|${retorno}|${saida}`,
  );
  const recusa = recusaDaPrevia(estado);

  if (!comRetorno && !comSaida) {
    const idExpl = `p${indice + 1}-expl`;
    return (
      <>
        <span className={listas['item__meta']} id={idExpl}>
          {TEXTO_NADA_A_CORRIGIR}
        </span>
        <Botao
          variante="secundario"
          aria-disabled="true"
          aria-describedby={`${idTitulo} ${idExpl}`}
          onClick={() => undefined}
        >
          Corrigir datas
        </Botao>
      </>
    );
  }

  const anterior = ficha.periodos[indice - 1]?.fim ?? null;
  const proximo = ficha.periodos[indice + 1]?.inicio ?? null;

  function abrir() {
    setRetorno(periodo.inicio);
    setSaida(periodo.fim ?? '');
    setErros({});
    setFalha(undefined);
    setAberto(true);
  }

  function confirmar() {
    if (corrigir.isPending || estado.tipo !== 'pronta') return;
    const previa = estado.previa;
    avisar(null);
    setFalha(undefined);
    setRodadas(null);
    const dados: { retorno?: string; saida?: string } = {};
    if (comRetorno) dados.retorno = retorno;
    if (comSaida) dados.saida = saida;
    corrigir.mutate(
      { periodoId: periodo.id, dados },
      {
        onSuccess: () => {
          setAberto(false);
          avisar(TEXTO_DATAS_CORRIGIDAS);
          // PAR-121: as rodadas que passaram a constar, pela prévia que o admin viu ao confirmar.
          setRodadas(textoRodadasConfirmadas(previa));
        },
        onError: (erro) => {
          const m = mensagensDosCampos(erro);
          const porCampo = { retorno: m.retorno, saida: m.saida };
          if (porCampo.retorno || porCampo.saida) {
            setErros(porCampo);
            return;
          }
          const { campo, faixa } = erroDePeriodo(erro);
          setErros(campo ? (comRetorno ? { retorno: campo } : { saida: campo }) : {});
          setFalha(faixa);
        },
      },
    );
  }

  return (
    <>
      {rodadas ? (
        <Faixa
          tipo="atencao"
          acao={
            <LinkBotao para={`${rotaDoGrupo(grupoId)}/partidas`} variante="texto">
              Abrir partidas
            </LinkBotao>
          }
        >
          {rodadas}
        </Faixa>
      ) : null}
      <Botao variante="secundario" aria-describedby={idTitulo} onClick={abrir}>
        Corrigir datas
      </Botao>
      {aberto ? (
        <Dialogo
          titulo="Corrigir datas"
          descricao={textoDoPeriodo(ficha.apelido, periodo, indice)}
          aoFechar={() => setAberto(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Cancelar
              </Botao>
              <Botao
                carregando={corrigir.isPending}
                disabled={estado.tipo !== 'pronta'}
                onClick={confirmar}
              >
                Confirmar novas datas
              </Botao>
            </>
          }
        >
          {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
          {comRetorno ? (
            <CampoData
              id="retorno"
              rotulo="Data de retorno"
              max={hoje}
              ajuda={ajudaRetornoCorrecao(anterior)}
              erro={erros.retorno ?? (comRetorno ? recusa : undefined)}
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
            />
          ) : null}
          {comSaida ? (
            <CampoData
              id="saida"
              rotulo="Data de saída"
              max={hoje}
              ajuda={ajudaSaida(proximo)}
              erro={erros.saida ?? (!comRetorno ? recusa : undefined)}
              value={saida}
              onChange={(e) => setSaida(e.target.value)}
            />
          ) : null}
          <BlocoPrevia
            estado={estado}
            tentarDeNovo={tentarDeNovo}
            mostrar={(p) => <PreviaPeriodos previa={p} />}
          />
        </Dialogo>
      ) : null}
    </>
  );
}

export function AlterarInicio({
  grupoId,
  ficha,
  avisar,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  avisar: (texto: string | null) => void;
}) {
  const alterar = useAlterarInicio(grupoId, ficha.id);
  const [aberto, setAberto] = useState(false);
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [data, setData] = useState(ficha.inicioPontuacao);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [falha, setFalha] = useState<string | undefined>(undefined);
  const previas = usePedirPrevias(grupoId, ficha.id);
  const { estado, tentarDeNovo } = usePrevia(
    aberto && ehDataReal(data) ? () => previas.inicio(data) : null,
    `${aberto ? 'aberto' : 'fechado'}|${data}`,
  );

  function abrir() {
    setData(ficha.inicioPontuacao);
    setErro(undefined);
    setFalha(undefined);
    setAberto(true);
  }

  function confirmar() {
    if (alterar.isPending || estado.tipo !== 'pronta') return;
    avisar(null);
    setFalha(undefined);
    alterar.mutate(
      { data },
      {
        onSuccess: () => {
          setAberto(false);
          avisar(textoInicioAlterado(data));
        },
        onError: (e) => {
          const { campo, faixa } = erroDePeriodo(e);
          setErro(campo);
          setFalha(faixa);
        },
      },
    );
  }

  return (
    <>
      <Botao variante="secundario" aria-describedby="inicio-valor" onClick={abrir}>
        Alterar data de início
      </Botao>
      {aberto ? (
        <Dialogo
          titulo="Alterar data de início"
          descricao={textoInicioAtual(ficha.apelido, ficha.inicioPontuacao)}
          aoFechar={() => setAberto(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Cancelar
              </Botao>
              <Botao
                carregando={alterar.isPending}
                disabled={estado.tipo !== 'pronta'}
                onClick={confirmar}
              >
                Confirmar nova data
              </Botao>
            </>
          }
        >
          {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
          <CampoData
            id="inicio"
            rotulo="Data de início"
            min={PISO_DATA_ENTRADA}
            max={hoje}
            ajuda={AJUDA_INICIO}
            erro={erro ?? recusaDaPrevia(estado)}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          <BlocoPrevia
            estado={estado}
            tentarDeNovo={tentarDeNovo}
            mostrar={(p) => <PreviaInicio previa={p} />}
          />
        </Dialogo>
      ) : null}
    </>
  );
}
