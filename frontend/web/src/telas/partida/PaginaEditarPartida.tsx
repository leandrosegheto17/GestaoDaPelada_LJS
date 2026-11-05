import type { PartidaCorpo, PartidaResposta } from '@pelada/contrato/partidas';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros, type ErroDoResumo } from '../../componentes/ResumoErros.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { useEditarPartida, useExcluirPartida, usePartida } from '../../dados/partidas.ts';
import { diaEHora } from '../financeiro/Lancamento.tsx';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { FormularioPartida } from './FormularioPartida.tsx';
import { avisoPartidaSalva, diaMes, TEXTO_FALHA_SALVAR } from './PaginaNovaPartida.tsx';

/**
 * Editar e excluir partida (`/app/grupos/:grupoId/partidas/:data`, t11; partidas-e-ranking T61; PAR-52 a PAR-54), de
 * `.specs/mockup/telas/t11-partida--{edicao,excluir}.html`:
 * - a data aparece sem campo editável (somente leitura; PAR-52), com "Última alteração: <nome>, dd/mm hh:mm" na hora
 *   de São Paulo, e o mesmo formulário do lançamento (`FormularioPartida`) com as situações gravadas;
 * - "Excluir partida" abre o diálogo "Excluir a partida de dd/mm?" com o texto do recálculo, "Cancelar" e
 *   "Excluir partida" (PAR-53); a exclusão vai às partidas do mês com "Partida de dd/mm excluída.", e a falha mostra
 *   "Não foi possível excluir a partida. Tente de novo." (PAR-54);
 * - salvar a edição também volta às partidas do mês, com "Partida de dd/mm salva.".
 *   [LACUNA] a spec não diz o destino da edição salva; segue o da exclusão.
 */

export const TEXTO_RECALCULO =
  'As presenças dessa partida saem do ranking, e os pontos de todos são recalculados.';
export const TEXTO_FALHA_EXCLUIR = 'Não foi possível excluir a partida. Tente de novo.';

export function tituloExcluir(data: string): string {
  return `Excluir a partida de ${diaMes(data)}?`;
}

export function avisoPartidaExcluida(data: string): string {
  return `Partida de ${diaMes(data)} excluída.`;
}

export function textoUltimaAlteracaoPartida(
  p: Pick<PartidaResposta, 'alteradaPor' | 'alteradaEm'>,
): string {
  return `Última alteração: ${p.alteradaPor}, ${diaEHora(p.alteradaEm)}`;
}

/** `…/partidas?mes=AAAA-MM` do mês da data. */
function partidasDoMes(base: string, data: string): string {
  return `${base}/partidas?mes=${data.slice(0, 7)}`;
}

const ROTULOS_CAMPOS: Readonly<Record<string, string>> = { data: 'Data', choveu: 'Choveu?' };

function DialogoExcluir({
  grupoId,
  data,
  aoFechar,
  aoExcluir,
  aoFalhar,
}: {
  grupoId: string;
  data: string;
  aoFechar: () => void;
  aoExcluir: () => void;
  aoFalhar: () => void;
}) {
  const excluir = useExcluirPartida(grupoId, data);

  function confirmar() {
    if (excluir.isPending) return;
    excluir.mutate(undefined, { onSuccess: aoExcluir, onError: aoFalhar });
  }

  return (
    <Dialogo
      alerta
      titulo={tituloExcluir(data)}
      descricao={TEXTO_RECALCULO}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" autoFocus onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="destrutivo" carregando={excluir.isPending} onClick={confirmar}>
            Excluir partida
          </Botao>
        </>
      }
    />
  );
}

function Edicao({
  grupoId,
  partida,
  base,
}: {
  grupoId: string;
  partida: PartidaResposta;
  base: string;
}) {
  const navegar = useNavigate();
  const editar = useEditarPartida(grupoId, partida.data);
  const [confirmando, setConfirmando] = useState(false);
  const [falhaExcluir, setFalhaExcluir] = useState(false);
  const [falhaSalvar, setFalhaSalvar] = useState<PartidaCorpo | null>(null);
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});

  function enviar(corpo: PartidaCorpo) {
    setFalhaSalvar(null);
    setErrosCampos({});
    editar.mutate(corpo, {
      onSuccess: () =>
        void navegar(partidasDoMes(base, partida.data), {
          state: { aviso: avisoPartidaSalva(partida.data) },
        }),
      onError: (erro) => {
        if (erro instanceof ErroApi && erro.status === 422) {
          setErrosCampos(mensagensDosCampos(erro));
          return;
        }
        setFalhaSalvar(corpo);
      },
    });
  }

  const resumo: ErroDoResumo[] = Object.keys(errosCampos)
    .filter((c) => c in ROTULOS_CAMPOS)
    .map((c) => ({ id: c, rotulo: ROTULOS_CAMPOS[c] ?? c }));
  const outras = Object.entries(errosCampos)
    .filter(([c]) => !(c in ROTULOS_CAMPOS))
    .map(([, m]) => m);

  return (
    <>
      {falhaExcluir ? <Faixa tipo="erro">{TEXTO_FALHA_EXCLUIR}</Faixa> : null}
      {falhaSalvar ? (
        <Faixa
          tipo="erro"
          acao={
            <Botao variante="texto" onClick={() => enviar(falhaSalvar)}>
              Tentar de novo
            </Botao>
          }
        >
          {TEXTO_FALHA_SALVAR}
        </Faixa>
      ) : null}
      <ResumoErros erros={resumo} />
      {outras.length > 0 ? <Faixa tipo="erro">{outras.join(' ')}</Faixa> : null}
      <FormularioPartida
        campoData={
          <CampoData
            id="data"
            rotulo="Data"
            value={partida.data}
            somenteLeitura
            ajuda={textoUltimaAlteracaoPartida(partida)}
            erro={errosCampos['data']}
          />
        }
        choveuInicial={partida.choveu}
        jogadores={partida.jogadores}
        salvando={editar.isPending}
        aoSalvar={({ choveu, marcacoes }) => enviar({ data: partida.data, choveu, marcacoes })}
        acoesExtras={
          <Botao
            variante="texto-destrutivo"
            onClick={() => {
              setFalhaExcluir(false);
              setConfirmando(true);
            }}
          >
            Excluir partida
          </Botao>
        }
      />
      {confirmando ? (
        <DialogoExcluir
          grupoId={grupoId}
          data={partida.data}
          aoFechar={() => setConfirmando(false)}
          aoExcluir={() =>
            void navegar(partidasDoMes(base, partida.data), {
              state: { aviso: avisoPartidaExcluida(partida.data) },
            })
          }
          aoFalhar={() => {
            setConfirmando(false);
            setFalhaExcluir(true);
          }}
        />
      ) : null}
    </>
  );
}

export function PaginaEditarPartida() {
  const { grupoId = '', data = '' } = useParams();
  const base = rotaDoGrupo(grupoId);
  const grupo = useGrupo(grupoId);
  const consulta = usePartida(grupoId, data);

  function conteudo() {
    if (consulta.isPending) return <EsqueletoLista rotulo="Carregando a partida…" />;
    if (consulta.isError) {
      if (consulta.error instanceof ErroApi && consulta.error.status === 404)
        return <Faixa tipo="atencao">Partida não encontrada.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    return <Edicao grupoId={grupoId} partida={consulta.data} base={base} />;
  }

  return (
    <Casca
      grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}
      titulo="Editar partida"
    >
      <LinkVoltar para={partidasDoMes(base, data)}>Partidas</LinkVoltar>
      {conteudo()}
    </Casca>
  );
}
