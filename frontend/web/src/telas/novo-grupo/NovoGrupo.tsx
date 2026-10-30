import type { DiaSemana } from '@pelada/contrato';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BarraAcao } from '../../componentes/barras/BarraAcao';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ResumoErros } from '../../componentes/campos/ResumoErros';
import type { ErrosDeCampos } from '../../dados/errosDeCampos';
import { useCriarGrupo } from '../../dados/grupos';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import {
  CamposDoGrupo,
  errosDaApi,
  GRUPO_VAZIO,
  resumoDoGrupo,
  validarGrupo,
  type ValoresGrupo,
} from './CamposDoGrupo';

/**
 * `/app/grupos/novo` (t27, sem "Primeiro admin"): nome, dia, horário e frequência (GEL-01, GEL-03 a GEL-06). As
 * regras são as do contrato, conferidas antes de enviar; o 422 da API cai nos mesmos campos (GEL-118). Ao criar,
 * vai ao início do grupo.
 */
export function NovoGrupo() {
  const [valores, setValores] = useState<ValoresGrupo>(GRUPO_VAZIO);
  const [erros, setErros] = useState<ErrosDeCampos>({});
  const criar = useCriarGrupo();
  const navegar = useNavigate();

  const enviar = () => {
    const encontrados = validarGrupo(valores);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    criar.mutate(
      { ...valores, nome: valores.nome.trim(), diaSemana: valores.diaSemana as DiaSemana },
      {
        onSuccess: (criado) => void navegar(`/app/grupos/${criado.id}`),
        onError: (erro) => {
          const daApi = errosDaApi(erro);
          if (daApi) setErros(daApi);
        },
      },
    );
  };

  const falhaDeEnvio = criar.isError && errosDaApi(criar.error) === null;
  return (
    <PaginaInterna titulo="Novo grupo" comMenu voltarPara="/app" voltarRotulo="Seus grupos">
      <Formulario aoEnviar={enviar} enviando={criar.isPending}>
        <ResumoErros erros={resumoDoGrupo(erros)} />
        {falhaDeEnvio ? <ErroEnvio /> : null}
        <CamposDoGrupo valores={valores} erros={erros} aoMudar={setValores} />
        <BarraAcao>
          <Botao type="submit" carregando={criar.isPending} rotuloCarregando="Criando grupo…">
            Criar grupo
          </Botao>
        </BarraAcao>
      </Formulario>
    </PaginaInterna>
  );
}
