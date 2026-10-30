import type { JogadorDetalhe } from '@pelada/contrato';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { ResumoErros } from '../../componentes/campos/ResumoErros';
import { useEditarJogador, useJogador } from '../../dados/elenco';
import { deErroApi, type ErrosDeCampos } from '../../dados/errosDeCampos';
import { useGrupo } from '../../dados/grupos';
import { hojeEmSaoPaulo } from '../../formatacao';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import {
  CamposDoJogador,
  corpoDaEdicao,
  resumoDoJogador,
  validarJogador,
  valoresDoDetalhe,
  type ValoresJogador,
} from './CamposDoJogador';
import { DataDeInicio } from './CorrigirDatas';
import estilos from './FichaJogador.module.css';
import { NotasDoJogador } from './NotasDoJogador';
import { PeriodosJogador, type DialogoDaSituacao } from './PeriodosJogador';

function Dados({
  grupoId,
  jogador,
  aoAvisar,
}: {
  grupoId: string;
  jogador: JogadorDetalhe;
  aoAvisar: (texto: string) => void;
}) {
  const [hoje] = useState(hojeEmSaoPaulo);
  const [valores, setValores] = useState<ValoresJogador>(() => valoresDoDetalhe(jogador));
  const [erros, setErros] = useState<ErrosDeCampos>({});
  const [salvo, setSalvo] = useState(false);
  const editar = useEditarJogador(grupoId, jogador.id);

  const salvar = () => {
    setSalvo(false);
    const encontrados = validarJogador(valores, hoje, true);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    editar.mutate(corpoDaEdicao(valores), {
      onSuccess: (novo) => {
        setValores(valoresDoDetalhe(novo));
        setSalvo(true);
      },
      onError: (erro) => {
        const daApi = deErroApi(erro);
        if (daApi) setErros(daApi);
      },
    });
  };

  const falhaDeEnvio = editar.isError && deErroApi(editar.error) === null;
  return (
    <section aria-labelledby="s-dados">
      <h2 id="s-dados" className="subtitulo">
        Dados
      </h2>
      {salvo ? <Faixa tipo="sucesso">Jogador salvo.</Faixa> : null}
      <Formulario aoEnviar={salvar} enviando={editar.isPending}>
        <ResumoErros erros={resumoDoJogador(erros)} />
        {falhaDeEnvio ? <ErroEnvio /> : null}
        <CamposDoJogador
          valores={valores}
          erros={erros}
          aoMudar={setValores}
          comDataEntrada={false}
          hoje={hoje}
          inicio={
            <DataDeInicio grupoId={grupoId} jogador={jogador} aoAlterado={() => aoAvisar('Data de início alterada.')} />
          }
        />
        <div>
          <Botao type="submit" carregando={editar.isPending} rotuloCarregando="Salvando…">
            Salvar
          </Botao>
        </div>
      </Formulario>
    </section>
  );
}

/**
 * `/app/grupos/:grupoId/jogadores/:jogadorId` (t16 edição): dados do jogador (GEL-41) e, abaixo, as notas por
 * habilidade com o nível (GEL-97, GEL-103), a situação com períodos, inativar, reativar, corrigir datas e data de
 * início (GEL-59, GEL-60, GEL-71, GEL-77) e a exclusão (GEL-86, GEL-87).
 */
export function FichaJogador() {
  const { grupoId = '', jogadorId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const ficha = useJogador(grupoId, jogadorId);
  const j = ficha.data;
  const [aviso, setAviso] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<DialogoDaSituacao>(null);
  return (
    <PaginaInterna
      titulo={j?.apelido ?? 'Jogador'}
      {...(grupo.data ? { nomeGrupo: grupo.data.nome } : {})}
      destinoTrocarGrupo="/app"
      voltarPara={`/app/grupos/${grupoId}/jogadores`}
      voltarRotulo="Jogadores"
      ocupado={ficha.isPending}
      tituloEmEsqueleto={ficha.isPending}
    >
      {ficha.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={3} />
        </>
      ) : null}
      {ficha.isError ? <ErroRede aoTentar={() => void ficha.refetch()} /> : null}
      {j ? (
        <>
          {aviso ? <Faixa tipo="sucesso">{aviso}</Faixa> : null}
          {recusa ? (
            <Faixa
              tipo="erro"
              acao={
                <span className={estilos.acaoDaFaixa}>
                  <Botao
                    variante="texto"
                    onClick={() => {
                      setRecusa(null);
                      setDialogo('inativar');
                    }}
                  >
                    Inativar em vez disso
                  </Botao>
                </span>
              }
            >
              {recusa}
            </Faixa>
          ) : null}
          <Dados key={`${j.id}-dados`} grupoId={grupoId} jogador={j} aoAvisar={setAviso} />
          <NotasDoJogador key={`${j.id}-notas`} grupoId={grupoId} jogador={j} />
          <PeriodosJogador
            grupoId={grupoId}
            jogador={j}
            aoAvisar={setAviso}
            dialogo={dialogo}
            aoMudarDialogo={setDialogo}
            aoRecusarExclusao={setRecusa}
          />
        </>
      ) : null}
    </PaginaInterna>
  );
}
