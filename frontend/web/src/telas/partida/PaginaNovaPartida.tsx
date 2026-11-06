import { MENSAGEM_DATA_FUTURA } from '@pelada/contrato/elenco';
import { ehDataReal } from '@pelada/dominio';
import type { PartidaCorpo } from '@pelada/contrato/partidas';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import {
  FaixaSomenteLeitura,
  TrechoSomenteLeitura,
} from '../../componentes/FaixaSomenteLeitura.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros, type ErroDoResumo } from '../../componentes/ResumoErros.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { useLancarPartida, usePartidaNova } from '../../dados/partidas.ts';
import estilos from '../acesso.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { FormularioPartida } from './FormularioPartida.tsx';
import pagina from './partida.module.css';

/**
 * Lançar partida (`/app/grupos/:grupoId/partidas/nova`, t11; partidas-e-ranking T60; PAR-31 a PAR-36, PAR-147), do
 * mockup do módulo `t11-partida--nova.html` (R-04) e de `.specs/mockup/telas/t11-partida--{carregando,vazio,
 * data-futura,duplicada,erro-salvar}.html`:
 * - abre na data sugerida pela API, com "Choveu?" em Não e as situações que ela devolveu (todas ausentes, ou as da
 *   escalação confirmada; SIM-75); com `preMarcadaPelaEscalacao`, a faixa "Pré-marcado pela escalação de dd/mm (inclui
 *   quem ficou como “não entra”)." abaixo da data (simulador T52; SIM-77, `t11-partida--pre-marcada.html:22`);
 * - trocar a data mostra "Carregando os jogadores ativos em dd/mm…" e recarrega a lista (PAR-32); data no futuro fica
 *   no campo, "A data não pode ser no futuro.", sem consultar;
 * - sem ativos na data: "Ninguém estava ativo nessa data." (PAR-33);
 * - 409: "Já existe uma partida em dd/mm/aaaa." no campo e o link "Editar a partida de dd/mm" (PAR-34);
 * - 422 com campos: "Corrija N campos: …" e a mensagem em cada campo (PAR-147);
 * - rede ou servidor: "Não salvou. Suas marcações continuam aqui." com "Tentar de novo", sem perder as marcações
 *   (PAR-35);
 * - sucesso: volta ao início do grupo com "Partida de dd/mm salva." (PAR-36), pelo `state.aviso` da navegação;
 * - somente leitura (planos-e-cobranca T49; PLA-22): a faixa no topo e o formulário inteiro desabilitado (data,
 *   "Choveu?", marcações e salvar).
 */

export const TEXTO_FALHA_SALVAR = 'Não salvou. Suas marcações continuam aqui.';
export const TEXTO_SEM_ATIVOS = 'Ninguém estava ativo nessa data.';
export const TEXTO_SEM_ATIVOS_AJUDA =
  'Escolha outra data ou confira as datas de entrada dos jogadores.';

/** "2026-10-15" → "15/10". */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** "2026-10-15" → "15/10/2026". */
export function dataCompleta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function textoCarregandoJogadores(data: string): string {
  return `Carregando os jogadores ativos em ${diaMes(data)}…`;
}

/** Faixa da t11 pré-marcada (simulador T52; SIM-77), de `t11-partida--pre-marcada.html:22`. */
export function textoPreMarcada(data: string): string {
  return `Pré-marcado pela escalação de ${diaMes(data)} (inclui quem ficou como “não entra”).`;
}

export function avisoPartidaSalva(data: string): string {
  return `Partida de ${diaMes(data)} salva.`;
}

const ROTULOS_CAMPOS: Readonly<Record<string, string>> = { data: 'Data', choveu: 'Choveu?' };

type Envio = PartidaCorpo;

export function PaginaNovaPartida() {
  const { grupoId = '' } = useParams();
  const navegar = useNavigate();
  const base = rotaDoGrupo(grupoId);
  const grupo = useGrupo(grupoId);
  const lancar = useLancarPartida(grupoId);

  /** Data consultada: `undefined` é a sugerida pela API. */
  const [dataConsultada, setDataConsultada] = useState<string | undefined>(undefined);
  /** O que está no campo (pode ser vazio, inválido ou futuro, e aí não consulta). */
  const [dataDigitada, setDataDigitada] = useState<string | undefined>(undefined);
  const [erroData, setErroData] = useState<string | undefined>(undefined);
  const [duplicada, setDuplicada] = useState<string | null>(null);
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<Envio | null>(null);

  const consulta = usePartidaNova(grupoId, dataConsultada);
  const hoje = consulta.data?.hoje;
  const valorCampo = dataDigitada ?? consulta.data?.data ?? '';

  function trocarData(valor: string) {
    setDataDigitada(valor);
    setDuplicada(null);
    setErrosCampos({});
    setFalha(null);
    if (!ehDataReal(valor)) {
      setErroData(undefined);
      return;
    }
    if (hoje !== undefined && valor > hoje) {
      setErroData(MENSAGEM_DATA_FUTURA);
      return;
    }
    setErroData(undefined);
    setDataConsultada(valor);
  }

  function enviar(envio: Envio) {
    setFalha(null);
    setDuplicada(null);
    setErrosCampos({});
    lancar.mutate(envio, {
      onSuccess: (salva) => void navegar(base, { state: { aviso: avisoPartidaSalva(salva.data) } }),
      onError: (erro) => {
        if (erro instanceof ErroApi && erro.status === 409) {
          setDuplicada(envio.data);
          return;
        }
        if (erro instanceof ErroApi && erro.status === 422) {
          setErrosCampos(mensagensDosCampos(erro));
          return;
        }
        setFalha(envio);
      },
    });
  }

  function conteudo() {
    if (consulta.isError && consulta.data === undefined && dataConsultada === undefined) {
      if (consulta.error instanceof ErroApi && consulta.error.status === 404)
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    if (consulta.isPending && dataConsultada === undefined)
      return <EsqueletoLista rotulo="Carregando os jogadores ativos…" />;

    const dataAtual = dataConsultada ?? consulta.data?.data ?? '';
    const erroDoCampo =
      erroData ??
      (duplicada ? `Já existe uma partida em ${dataCompleta(duplicada)}.` : errosCampos['data']);
    const resumo: ErroDoResumo[] = Object.keys(errosCampos)
      .filter((c) => c in ROTULOS_CAMPOS)
      .map((c) => ({ id: c, rotulo: ROTULOS_CAMPOS[c] ?? c }));
    const outrasMensagens = Object.entries(errosCampos)
      .filter(([c]) => !(c in ROTULOS_CAMPOS))
      .map(([, m]) => m);

    const campoData = (
      <div className={pagina['campo-data']}>
        <CampoData
          id="data"
          rotulo="Data"
          value={valorCampo}
          max={hoje}
          erro={erroDoCampo}
          onChange={(e) => trocarData(e.target.value)}
        />
        {duplicada ? (
          <LinkBotao
            para={`${base}/partidas/${encodeURIComponent(duplicada)}`}
            variante="secundario"
          >
            {`Editar a partida de ${diaMes(duplicada)}`}
          </LinkBotao>
        ) : null}
      </div>
    );

    let semLista = null;
    let jogadores = consulta.data?.jogadores;
    if (erroData) {
      jogadores = undefined;
    } else if (consulta.isPending) {
      // Só o pendente (sem dado para a data): uma releitura em segundo plano não pode apagar as marcações (PAR-35).
      jogadores = undefined;
      semLista = (
        <>
          <p className="sr" role="status">
            {textoCarregandoJogadores(dataAtual)}
          </p>
          <EsqueletoLista rotulo={textoCarregandoJogadores(dataAtual)} />
        </>
      );
    } else if (consulta.isError) {
      semLista = <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    } else if (jogadores && jogadores.length === 0) {
      semLista = (
        <div className={`${estilos.vazio} ${pagina['acima-4']}`} role="status">
          <h2 className={estilos['vazio__titulo']}>{TEXTO_SEM_ATIVOS}</h2>
          <p className={estilos['vazio__texto']}>{TEXTO_SEM_ATIVOS_AJUDA}</p>
        </div>
      );
    }

    // Pré-marcação pela escalação confirmada (simulador T52; SIM-75, SIM-77): só com a lista da data na tela; as
    // marcações continuam editáveis antes de salvar.
    const preMarcada =
      jogadores !== undefined &&
      jogadores.length > 0 &&
      consulta.data?.preMarcadaPelaEscalacao === true;
    const avisoPreMarcada = preMarcada ? (
      <div className={pagina['acima-3']}>
        <Faixa tipo="info">{textoPreMarcada(dataAtual)}</Faixa>
      </div>
    ) : null;

    return (
      <>
        {falha ? (
          <Faixa
            tipo="erro"
            acao={
              <Botao variante="texto" onClick={() => enviar(falha)}>
                Tentar de novo
              </Botao>
            }
          >
            {TEXTO_FALHA_SALVAR}
          </Faixa>
        ) : null}
        <ResumoErros erros={resumo} />
        {outrasMensagens.length > 0 ? <Faixa tipo="erro">{outrasMensagens.join(' ')}</Faixa> : null}
        <TrechoSomenteLeitura grupoId={grupoId}>
          <FormularioPartida
            key={`${dataAtual}-${jogadores ? 'lista' : 'sem-lista'}`}
            campoData={campoData}
            choveuInicial={consulta.data?.choveu ?? false}
            jogadores={jogadores}
            semLista={semLista}
            avisoAposData={avisoPreMarcada}
            salvando={lancar.isPending}
            aoSalvar={({ choveu, marcacoes }) => enviar({ data: dataAtual, choveu, marcacoes })}
          />
        </TrechoSomenteLeitura>
      </>
    );
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}>
      <LinkVoltar para={base}>Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Lançar partida</h1>
      <FaixaSomenteLeitura grupoId={grupoId} />
      {conteudo()}
    </Casca>
  );
}
