import type { JogadorDetalhe } from '@pelada/contrato/elenco';
import type { PreviaResposta } from '@pelada/contrato/previas';
import { ehDataReal, formatarData } from '@pelada/dominio';
import { useState, type ReactNode } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { PreviaPeriodos, textoRodadas } from '../../componentes/PreviaPeriodos.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useInativarJogador, useReativarJogador } from '../../dados/elenco.ts';
import { useEmSomenteLeitura } from '../../dados/somente-leitura.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import {
  TEXTO_CALCULANDO,
  TEXTO_ERRO_PREVIA,
  usePedirPrevias,
  usePrevia,
  type EstadoPrevia,
} from '../../dados/previas.ts';
import estilosPrevia from '../../componentes/PreviaPeriodos.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';

/**
 * Inativar e reativar na ficha do jogador (GEL-51 a GEL-60, GEL-114), de `t16-jogador--inativar`,
 * `--inativo`, `--reativar`, `--reativar-erro` e `--reativado` do mockup do módulo:
 * - ativo: "Inativar" abre o diálogo com o aviso exato da spec (GEL-59), a data de saída (hoje,
 *   sem futuro no seletor) e Cancelar e Inativar; inativado, a ficha relê e mostra "Inativo desde";
 * - inativo: "Reativar" abre o diálogo com a data de retorno (hoje) e a ajuda com a saída
 *   anterior; reativado, a faixa "<apelido> reativado desde <dd/mm/aaaa>." (GEL-60);
 * - os erros de período (422, GEL-61 a GEL-69) ficam no campo de data; 409 (já inativo ou já
 *   ativo, GEL-53, GEL-56) e outras falhas, na faixa do diálogo.
 * `acaoExtra` recebe o botão "Excluir jogador" (T67), e `abrirInativar` deixa a exclusão
 * recusada abrir o diálogo de inativar ("Inativar em vez disso", GEL-86).
 *
 * Prévia no reativar (partidas-e-ranking T66; PAR-120, PAR-121, PAR-159), do mockup do módulo da partidas-e-ranking
 * (`t16-jogador--reativar{,-calculando,-previa,-erro,-erro-rede}.html`, `--reativado`): o texto passa a "Volta a
 * aparecer no ranking e nas partidas; a data de início não muda."; a prévia é pedida 300 ms depois da última troca de
 * data, com "Calculando…" e "Reativar" desabilitado até ela voltar sem erro; a recusa (4xx) fica no campo e o erro de
 * rede numa faixa com "Tentar de novo"; confirmado com rodadas que passam a constar, a ficha mostra "N rodadas
 * passaram a constar: … Elas valem 0 ponto …" com "Abrir partidas". Os diálogos de corrigir e de início usam o mesmo
 * bloco (`BlocoPrevia`, em `CorrigirDatas.tsx`).
 */

export const TEXTO_INATIVAR =
  'Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados.';
export const TEXTO_REATIVAR_JOGADOR =
  'Volta a aparecer no ranking e nas partidas; a data de início não muda.';
export const tituloInativar = (apelido: string) => `Inativar ${apelido}`;
export const tituloReativarJogador = (apelido: string) => `Reativar ${apelido}`;
export const textoReativado = (apelido: string, data: string) =>
  `${apelido} reativado desde ${formatarData(data)}.`;
export const ajudaRetorno = (saidaAnterior: string | null) =>
  saidaAnterior === null
    ? 'Pode ser uma data que já passou, se ele voltou a jogar antes de você registrar.'
    : `Pode ser uma data que já passou, se ele voltou a jogar antes de você registrar. Não pode ser antes da saída anterior (${formatarData(saidaAnterior)}).`;

/** Erro de período: a mensagem do campo `data`, ou a do 422 sem campo; o resto vai para a faixa. */
export function erroDePeriodo(erro: unknown): { campo?: string; faixa?: string } {
  const campo = mensagensDosCampos(erro).data;
  if (campo) return { campo };
  if (erro instanceof ErroApi && erro.status === 422) return { campo: erro.message };
  return { faixa: erro instanceof ErroApi ? erro.message : MENSAGEM_REDE };
}

/** A saída do último período encerrado (o anterior ao retorno). */
export function saidaAnterior(ficha: Pick<JogadorDetalhe, 'periodos'>): string | null {
  const fins = ficha.periodos.map((p) => p.fim).filter((f): f is string => f !== null);
  return fins.length === 0 ? null : (fins.sort().at(-1) ?? null);
}

/** Erro da prévia que é recusa (4xx: 422, 409, 404): a mensagem vai para o campo; o resto é erro de rede. */
export function recusaDaPrevia(estado: EstadoPrevia<unknown>): string | undefined {
  if (estado.tipo !== 'erro') return undefined;
  const { erro } = estado;
  if (erro instanceof ErroApi && erro.status >= 400 && erro.status < 500)
    return erroDePeriodo(erro).campo ?? erro.message;
  return undefined;
}

/** "Calculando…", a prévia pronta, ou a faixa de erro de rede com "Tentar de novo" (a recusa fica no campo). */
export function BlocoPrevia<T>({
  estado,
  tentarDeNovo,
  mostrar,
}: {
  estado: EstadoPrevia<T>;
  tentarDeNovo: () => void;
  mostrar: (previa: T) => ReactNode;
}) {
  if (estado.tipo === 'calculando') {
    return (
      <div aria-live="polite">
        <p className={estilosPrevia.paragrafo}>{TEXTO_CALCULANDO}</p>
      </div>
    );
  }
  if (estado.tipo === 'pronta') return <>{mostrar(estado.previa)}</>;
  if (estado.tipo === 'erro' && recusaDaPrevia(estado) === undefined) {
    return (
      <Faixa
        tipo="erro"
        acao={
          <Botao variante="texto" onClick={tentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      >
        {TEXTO_ERRO_PREVIA}
      </Faixa>
    );
  }
  return null;
}

/** "2 rodadas passaram a constar: 08/10 e 15/10. Elas valem 0 ponto …" (PAR-121); sem rodadas, nulo. */
export function textoRodadasConfirmadas(previa: PreviaResposta): string | null {
  const rodadas = textoRodadas(
    previa.rodadasQuePassamAConstar.map((r) => r.data),
    'passaram',
  );
  if (rodadas === '') return null;
  return previa.aviso ? `${rodadas} ${previa.aviso}` : rodadas;
}

function DialogoData({
  titulo,
  texto,
  id,
  rotulo,
  ajuda,
  rotuloAcao,
  enviando,
  aoFechar,
  aoConfirmar,
  erroCampo,
  falha,
  pedirPrevia,
  aoConfirmarComPrevia,
}: {
  titulo: string;
  texto: string;
  id: string;
  rotulo: string;
  ajuda?: string | undefined;
  rotuloAcao: string;
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (data: string) => void;
  erroCampo?: string | undefined;
  falha?: string | undefined;
  /** Com prévia (reativar, T66): o botão só habilita com a prévia pronta, e `aoConfirmarComPrevia` recebe a prévia. */
  pedirPrevia?: (data: string) => Promise<PreviaResposta>;
  aoConfirmarComPrevia?: (data: string, previa: PreviaResposta) => void;
}) {
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [data, setData] = useState(hoje);
  const { estado, tentarDeNovo } = usePrevia(
    pedirPrevia && ehDataReal(data) ? () => pedirPrevia(data) : null,
    data,
  );
  const comPrevia = pedirPrevia !== undefined;
  const prontaParaConfirmar = !comPrevia || estado.tipo === 'pronta';
  const erroDoCampo = erroCampo ?? (comPrevia ? recusaDaPrevia(estado) : undefined);

  function confirmar() {
    if (!prontaParaConfirmar) return;
    if (estado.tipo === 'pronta' && aoConfirmarComPrevia) aoConfirmarComPrevia(data, estado.previa);
    else aoConfirmar(data);
  }

  return (
    <Dialogo
      titulo={titulo}
      descricao={texto}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" autoFocus onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao carregando={enviando} disabled={!prontaParaConfirmar} onClick={confirmar}>
            {rotuloAcao}
          </Botao>
        </>
      }
    >
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <CampoData
        id={id}
        rotulo={rotulo}
        max={hoje}
        ajuda={ajuda}
        erro={erroDoCampo}
        value={data}
        onChange={(e) => setData(e.target.value)}
      />
      {comPrevia ? (
        <BlocoPrevia
          estado={estado}
          tentarDeNovo={tentarDeNovo}
          mostrar={(p) => <PreviaPeriodos previa={p} />}
        />
      ) : null}
    </Dialogo>
  );
}

export function AcoesSituacao({
  grupoId,
  ficha,
  avisar,
  rodadas,
  setRodadas,
  acaoExtra,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  avisar: (texto: string | null) => void;
  /** Faixa das rodadas que passaram a constar (reativar ou corrigir): o estado fica na seção Situação da ficha. */
  rodadas: string | null;
  setRodadas: (texto: string | null) => void;
  /** Botão ao lado (T67), que recebe como abrir o diálogo de inativar. */
  acaoExtra?: (abrirInativar: () => void) => ReactNode;
}) {
  const inativar = useInativarJogador(grupoId, ficha.id);
  const reativar = useReativarJogador(grupoId, ficha.id);
  const previas = usePedirPrevias(grupoId, ficha.id);
  // Somente leitura (planos-e-cobranca T48; PLA-22): reativar trava (PLA-16); inativar nunca (PLA-15).
  const somenteLeitura = useEmSomenteLeitura(grupoId);
  const [aberto, setAberto] = useState<'inativar' | 'reativar' | null>(null);
  const [erroCampo, setErroCampo] = useState<string | undefined>(undefined);
  const [falha, setFalha] = useState<string | undefined>(undefined);

  function abrir(qual: 'inativar' | 'reativar') {
    setErroCampo(undefined);
    setFalha(undefined);
    setAberto(qual);
  }

  function aoFalhar(erro: unknown) {
    const { campo, faixa } = erroDePeriodo(erro);
    setErroCampo(campo);
    setFalha(faixa);
  }

  function confirmarInativar(data: string) {
    if (inativar.isPending) return;
    avisar(null);
    inativar.mutate(
      { data },
      {
        onSuccess: () => setAberto(null),
        onError: aoFalhar,
      },
    );
  }

  function confirmarReativar(data: string, previa?: PreviaResposta) {
    if (reativar.isPending) return;
    avisar(null);
    setRodadas(null);
    reativar.mutate(
      { data },
      {
        onSuccess: () => {
          setAberto(null);
          avisar(textoReativado(ficha.apelido, data));
          // PAR-121: as rodadas que passaram a constar, pela prévia que o admin viu ao confirmar.
          setRodadas(previa ? textoRodadasConfirmadas(previa) : null);
        },
        onError: aoFalhar,
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
      <div className={modulo['grupo-botoes']}>
        {ficha.situacao === 'ativo' ? (
          <Botao variante="secundario" onClick={() => abrir('inativar')}>
            Inativar
          </Botao>
        ) : (
          <Botao variante="secundario" disabled={somenteLeitura} onClick={() => abrir('reativar')}>
            Reativar
          </Botao>
        )}
        {acaoExtra ? acaoExtra(() => abrir('inativar')) : null}
      </div>
      {aberto === 'inativar' ? (
        <DialogoData
          titulo={tituloInativar(ficha.apelido)}
          texto={TEXTO_INATIVAR}
          id="saida"
          rotulo="Data de saída"
          rotuloAcao="Inativar"
          enviando={inativar.isPending}
          aoFechar={() => setAberto(null)}
          aoConfirmar={confirmarInativar}
          erroCampo={erroCampo}
          falha={falha}
        />
      ) : null}
      {aberto === 'reativar' ? (
        <DialogoData
          titulo={tituloReativarJogador(ficha.apelido)}
          texto={TEXTO_REATIVAR_JOGADOR}
          id="retorno"
          rotulo="Data de retorno"
          ajuda={ajudaRetorno(saidaAnterior(ficha))}
          rotuloAcao="Reativar"
          enviando={reativar.isPending}
          aoFechar={() => setAberto(null)}
          aoConfirmar={(data) => confirmarReativar(data)}
          pedirPrevia={previas.reativar}
          aoConfirmarComPrevia={confirmarReativar}
          erroCampo={erroCampo}
          falha={falha}
        />
      ) : null}
    </>
  );
}
