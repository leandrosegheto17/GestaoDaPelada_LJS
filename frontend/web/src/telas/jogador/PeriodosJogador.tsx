import type { JogadorDetalhe } from '@pelada/contrato/elenco';
import { formatarData } from '@pelada/dominio';
import { useState, type ReactNode } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useInativarJogador, useReativarJogador } from '../../dados/elenco.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import modulo from '../grupos-elenco.module.css';

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
 */

export const TEXTO_INATIVAR =
  'Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados.';
export const TEXTO_REATIVAR_JOGADOR = 'Volta a aparecer no ranking e nas partidas; a data de início e os pontos não mudam.';
export const tituloInativar = (apelido: string) => `Inativar ${apelido}`;
export const tituloReativarJogador = (apelido: string) => `Reativar ${apelido}`;
export const textoReativado = (apelido: string, data: string) => `${apelido} reativado desde ${formatarData(data)}.`;
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
}: {
  titulo: string;
  texto: string;
  id: string;
  rotulo: string;
  ajuda?: string;
  rotuloAcao: string;
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (data: string) => void;
  erroCampo?: string;
  falha?: string;
}) {
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [data, setData] = useState(hoje);
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
          <Botao carregando={enviando} onClick={() => aoConfirmar(data)}>
            {rotuloAcao}
          </Botao>
        </>
      }
    >
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <CampoData id={id} rotulo={rotulo} max={hoje} ajuda={ajuda} erro={erroCampo} value={data} onChange={(e) => setData(e.target.value)} />
    </Dialogo>
  );
}

export function AcoesSituacao({
  grupoId,
  ficha,
  avisar,
  acaoExtra,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  avisar: (texto: string | null) => void;
  /** Botão ao lado (T67), que recebe como abrir o diálogo de inativar. */
  acaoExtra?: (abrirInativar: () => void) => ReactNode;
}) {
  const inativar = useInativarJogador(grupoId, ficha.id);
  const reativar = useReativarJogador(grupoId, ficha.id);
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

  function confirmarReativar(data: string) {
    if (reativar.isPending) return;
    avisar(null);
    reativar.mutate(
      { data },
      {
        onSuccess: () => {
          setAberto(null);
          avisar(textoReativado(ficha.apelido, data));
        },
        onError: aoFalhar,
      },
    );
  }

  return (
    <>
      <div className={modulo['grupo-botoes']}>
        {ficha.situacao === 'ativo' ? (
          <Botao variante="secundario" onClick={() => abrir('inativar')}>
            Inativar
          </Botao>
        ) : (
          <Botao variante="secundario" onClick={() => abrir('reativar')}>
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
          aoConfirmar={confirmarReativar}
          erroCampo={erroCampo}
          falha={falha}
        />
      ) : null}
    </>
  );
}
