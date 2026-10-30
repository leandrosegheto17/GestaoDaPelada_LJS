import type { DiaSemana, GrupoDetalhe } from '@pelada/contrato';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Selo } from '../../componentes/basicos/Selo';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { ResumoErros } from '../../componentes/campos/ResumoErros';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { deErroApi, type ErrosDeCampos } from '../../dados/errosDeCampos';
import { useArquivarGrupo, useEditarGrupo, useGrupo } from '../../dados/grupos';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import { CamposDoGrupo, resumoDoGrupo, validarGrupo, type ValoresGrupo } from '../novo-grupo/CamposDoGrupo';
import estilos from './DadosDoGrupo.module.css';

const valoresDe = (g: GrupoDetalhe): ValoresGrupo => ({
  nome: g.nome,
  diaSemana: g.diaSemana,
  frequencia: g.frequencia,
  horario: g.horario,
});

/**
 * Confirmação de arquivar (t20 arquivar e arquivar-erro, GEL-22, GEL-23). Destrutivo: Esc não fecha e o foco começa
 * em Cancelar. O botão só habilita com o nome exato do grupo (caixa e espaços contam); a API confere de novo e o 422
 * dela aparece no campo.
 * SPEC_DEVIATION: o comentário do mockup t20 arquivar diz que o botão fica sempre habilitado; vale o critério da T60
 * ("Arquivar só habilita com o nome exato"). O 422 continua aparecendo quando o nome mudou no servidor.
 */
function DialogoArquivar({ grupo, aoFechar }: { grupo: GrupoDetalhe; aoFechar: () => void }) {
  const refCancelar = useRef<HTMLButtonElement>(null);
  const [digitado, setDigitado] = useState('');
  const arquivar = useArquivarGrupo(grupo.id);
  const navegar = useNavigate();
  const erroDoNome = deErroApi(arquivar.error)?.['nomeConfirmacao'];
  const falhaDeEnvio = arquivar.isError && !erroDoNome;

  const confirmar = () =>
    arquivar.mutate(digitado, {
      onSuccess: () => void navegar('/app', { state: { aviso: 'arquivado' } }),
    });

  return (
    <Dialogo
      titulo={`Arquivar “${grupo.nome}”?`}
      descricao="Os outros admins perdem o acesso e o grupo não pode ser alterado enquanto estiver arquivado. Os dados ficam guardados e você pode reativar em Seus grupos."
      destrutivo
      refFocoInicial={refCancelar}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao ref={refCancelar} variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="destrutivo"
            disabled={digitado !== grupo.nome}
            carregando={arquivar.isPending}
            rotuloCarregando="Arquivando…"
            onClick={confirmar}
          >
            Arquivar grupo
          </Botao>
        </>
      }
    >
      <CampoTexto
        id="conf"
        rotulo="Digite o nome do grupo para confirmar"
        autoComplete="off"
        erro={erroDoNome}
        erroComoAlerta
        valor={digitado}
        aoMudar={(v) => {
          arquivar.reset();
          setDigitado(v);
        }}
      />
      {falhaDeEnvio ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

/** Link público do ranking (GEL-17), vindo da API: copiar e compartilhar, sem endereço fixo no código. */
function LinkDoRanking({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
  };
  const compartilhar = async () => {
    if (typeof navigator.share === 'function') await navigator.share({ url: link }).catch(() => undefined);
    else await copiar();
  };
  return (
    <section className={`${estilos.cartao} secao`} aria-labelledby="link">
      <h2 id="link" className="subtitulo sem-topo">
        Link do ranking
      </h2>
      <p className="paragrafo" id="url">
        <strong>{link}</strong>
      </p>
      <div className={estilos.botoes}>
        <Botao variante="secundario" aria-describedby="url" onClick={() => void copiar()}>
          Copiar link
        </Botao>
        <Botao variante="secundario" aria-describedby="url" onClick={() => void compartilhar()}>
          Compartilhar
        </Botao>
      </div>
      {copiado ? (
        <p className="acima-2" role="status">
          <Selo tom="sucesso">Link copiado</Selo>
        </p>
      ) : null}
    </section>
  );
}

function Formularios({ grupo }: { grupo: GrupoDetalhe }) {
  const [valores, setValores] = useState<ValoresGrupo>(() => valoresDe(grupo));
  const [erros, setErros] = useState<ErrosDeCampos>({});
  const [salvo, setSalvo] = useState(false);
  const [arquivando, setArquivando] = useState(false);
  const editar = useEditarGrupo(grupo.id);

  const salvar = () => {
    setSalvo(false);
    const encontrados = validarGrupo(valores);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    editar.mutate(
      { ...valores, nome: valores.nome.trim(), diaSemana: valores.diaSemana as DiaSemana },
      {
        onSuccess: (novo) => {
          setValores(valoresDe(novo));
          setSalvo(true);
        },
        onError: (erro) => {
          const daApi = deErroApi(erro);
          if (daApi) setErros(daApi);
        },
      },
    );
  };

  const falhaDeEnvio = editar.isError && deErroApi(editar.error) === null;
  return (
    <>
      {salvo ? <Faixa tipo="sucesso">Dados salvos.</Faixa> : null}
      <Formulario aoEnviar={salvar} enviando={editar.isPending}>
        <ResumoErros erros={resumoDoGrupo(erros)} />
        {falhaDeEnvio ? <ErroEnvio /> : null}
        <CamposDoGrupo
          valores={valores}
          erros={erros}
          aoMudar={setValores}
          ajudaNome="Mudar o nome não muda o link do ranking."
        />
        <div>
          <Botao type="submit" carregando={editar.isPending} rotuloCarregando="Salvando…">
            Salvar
          </Botao>
        </div>
      </Formulario>
      <LinkDoRanking link={grupo.linkPublico} />
      {grupo.souCriador ? (
        <section className="secao" aria-labelledby="arquivar">
          <h2 id="arquivar" className="subtitulo">
            Arquivar grupo
          </h2>
          <p className="paragrafo">
            Os outros admins perdem o acesso e o grupo não pode ser alterado enquanto estiver arquivado. Nada é apagado:
            você reativa quando quiser, em Seus grupos.
          </p>
          <p className="paragrafo texto-sec">Só você vê esta opção, porque criou o grupo.</p>
          <Botao variante="destrutivo" onClick={() => setArquivando(true)}>
            Arquivar grupo
          </Botao>
        </section>
      ) : null}
      {arquivando ? <DialogoArquivar grupo={grupo} aoFechar={() => setArquivando(false)} /> : null}
    </>
  );
}

/**
 * `/app/grupos/:grupoId/dados` (t20): edita nome, dia, horário e frequência (GEL-18, GEL-19, GEL-118), mostra o link
 * do ranking para copiar e, só para quem criou o grupo, a zona de arquivar (GEL-22 a GEL-24). Sem "Pesos de
 * pontuação" (C6).
 */
export function DadosDoGrupo() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const g = grupo.data;
  return (
    <PaginaInterna
      titulo="Dados do grupo"
      {...(g ? { nomeGrupo: g.nome } : {})}
      destinoTrocarGrupo="/app"
      voltarPara={`/app/grupos/${grupoId}`}
      voltarRotulo="Início"
      ocupado={grupo.isPending}
    >
      {grupo.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={3} />
        </>
      ) : null}
      {grupo.isError ? <ErroRede aoTentar={() => void grupo.refetch()} /> : null}
      {g ? <Formularios key={g.id} grupo={g} /> : null}
    </PaginaInterna>
  );
}
