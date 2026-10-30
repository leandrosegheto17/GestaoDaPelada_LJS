import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BarraAcao } from '../../componentes/barras/BarraAcao';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ResumoErros } from '../../componentes/campos/ResumoErros';
import { useCriarJogador } from '../../dados/elenco';
import { deErroApi, type ErrosDeCampos } from '../../dados/errosDeCampos';
import { useGrupo } from '../../dados/grupos';
import { hojeEmSaoPaulo } from '../../formatacao';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import {
  CamposDoJogador,
  corpoDoCadastro,
  jogadorVazio,
  resumoDoJogador,
  validarJogador,
  type ValoresJogador,
} from './CamposDoJogador';

/**
 * `/app/grupos/:grupoId/jogadores/novo` (t16 novo): apelido, ano, posição, telefone, pontuação inicial e data de
 * entrada (GEL-31, GEL-33, GEL-34, GEL-36, GEL-39). As regras são as do contrato, conferidas antes de enviar; o 422
 * da API cai nos mesmos campos (GEL-118). Ao salvar, volta à lista.
 */
export function NovoJogador() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const [hoje] = useState(hojeEmSaoPaulo);
  const [valores, setValores] = useState<ValoresJogador>(() => jogadorVazio(hoje));
  const [erros, setErros] = useState<ErrosDeCampos>({});
  const criar = useCriarJogador(grupoId);
  const navegar = useNavigate();

  const enviar = () => {
    const encontrados = validarJogador(valores, hoje);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    criar.mutate(corpoDoCadastro(valores), {
      onSuccess: () => void navegar(`/app/grupos/${grupoId}/jogadores`),
      onError: (erro) => {
        const daApi = deErroApi(erro);
        if (daApi) setErros(daApi);
      },
    });
  };

  const falhaDeEnvio = criar.isError && deErroApi(criar.error) === null;
  return (
    <PaginaInterna
      titulo="Novo jogador"
      {...(grupo.data ? { nomeGrupo: grupo.data.nome } : {})}
      destinoTrocarGrupo="/app"
      voltarPara={`/app/grupos/${grupoId}/jogadores`}
      voltarRotulo="Jogadores"
    >
      <Formulario aoEnviar={enviar} enviando={criar.isPending}>
        <ResumoErros erros={resumoDoJogador(erros)} />
        {falhaDeEnvio ? <ErroEnvio /> : null}
        <CamposDoJogador valores={valores} erros={erros} aoMudar={setValores} comDataEntrada hoje={hoje} />
        <BarraAcao>
          <Botao type="submit" carregando={criar.isPending} rotuloCarregando="Salvando…">
            Salvar
          </Botao>
        </BarraAcao>
      </Formulario>
    </PaginaInterna>
  );
}
