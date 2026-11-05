import type { DadosGrupo as CorpoDadosGrupo, GrupoDetalhe } from '@pelada/contrato/grupo';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useArquivarGrupo, useEditarGrupo, useGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { AVISO_GRUPO_ARQUIVADO, rotaDoGrupo } from '../grupos/Grupos.tsx';
import {
  CamposGrupo,
  errosDoGrupo,
  resumoDoGrupo,
  type ErrosGrupo,
  type FormularioGrupo,
} from '../novo-grupo/NovoGrupo.tsx';

/**
 * Dados do grupo (`/app/grupos/:grupoId/dados`, t20; GEL-18, GEL-19, GEL-22, GEL-23, GEL-114, GEL-118):
 * - os mesmos campos da t27 (`CamposGrupo`, T59), preenchidos do `GET /api/grupos/:grupoId`;
 *   "Salvar" envia `PATCH` (`useEditarGrupo`, T53) e mostra "Dados salvos." (`t20-grupo--salvo`,
 *   GEL-18); 422 marca os campos com o resumo (GEL-19, GEL-118);
 * - o cartão "Link do ranking" com o link público (de `URL_PUBLICA`, GEL-17), "Copiar link"
 *   ("Link copiado", `t20-grupo--link-copiado`) e "Compartilhar" (sem `navigator.share`, copia);
 * - a zona "Arquivar grupo" só para a criadora (`souCriador`, `t20-grupo--nao-criador`): o
 *   diálogo pede o nome digitado; a API compara o nome exato (GEL-22) e, arquivado, a tela leva
 *   a `/app` com "Grupo arquivado." (T58); 422 mostra a mensagem no campo
 *   (`t20-grupo--arquivar-erro`, GEL-23);
 * - carregando e erro com "Tentar de novo" (`t20-grupo--carregando`, `t20-grupo--erro`).
 */

export const TEXTO_DADOS_SALVOS = 'Dados salvos.';
export const TEXTO_LINK_COPIADO = 'Link copiado';
export const TEXTO_FALHA_COPIAR = 'Não foi possível copiar o link.';
export const TEXTO_ZONA_ARQUIVAR =
  'Os outros admins perdem o acesso e o grupo não pode ser alterado enquanto estiver arquivado. Nada é apagado: você reativa quando quiser, em Seus grupos.';
export const TEXTO_SO_VOCE = 'Só você vê esta opção, porque criou o grupo.';
export const tituloArquivar = (nome: string) => `Arquivar “${nome}”?`;
export const TEXTO_ARQUIVAR =
  'Os outros admins perdem o acesso e o grupo não pode ser alterado enquanto estiver arquivado. Os dados ficam guardados e você pode reativar em Seus grupos.';
export const ROTULO_CONFIRMACAO = 'Digite o nome do grupo para confirmar';

function DialogoArquivar({ grupo, aoFechar }: { grupo: GrupoDetalhe; aoFechar: () => void }) {
  const navegar = useNavigate();
  const arquivar = useArquivarGrupo(grupo.id);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [falha, setFalha] = useState<string | null>(null);

  function confirmar() {
    if (arquivar.isPending) return;
    setFalha(null);
    arquivar.mutate(
      { nomeConfirmacao: nome },
      {
        onSuccess: () => void navegar('/app', { state: { aviso: AVISO_GRUPO_ARQUIVADO } }),
        onError: (e) => {
          const campo = mensagensDosCampos(e).nomeConfirmacao;
          setErro(campo);
          if (!campo) setFalha(e instanceof ErroApi ? e.message : MENSAGEM_REDE);
        },
      },
    );
  }

  return (
    <Dialogo
      alerta
      titulo={tituloArquivar(grupo.nome)}
      descricao={TEXTO_ARQUIVAR}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="destrutivo" carregando={arquivar.isPending} onClick={confirmar}>
            Arquivar grupo
          </Botao>
        </>
      }
    >
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <Campo
        id="conf"
        rotulo={ROTULO_CONFIRMACAO}
        autoComplete="off"
        autoFocus
        erro={erro}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
      />
    </Dialogo>
  );
}

function CartaoLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState<'sim' | 'falhou' | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado('sim');
    } catch {
      setCopiado('falhou');
    }
  }

  async function compartilhar() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: link });
      } catch {
        // Cancelar o compartilhamento não é erro.
      }
      return;
    }
    await copiar();
  }

  return (
    <section className={`${modulo.cartao} ${estilos.secao}`} aria-labelledby="link">
      <h2 id="link" className={`${estilos.subtitulo} ${modulo['sem-topo']}`}>
        Link do ranking
      </h2>
      <p className={estilos.paragrafo} id="url">
        <strong>{link}</strong>
      </p>
      <div className={modulo['grupo-botoes']}>
        <Botao variante="secundario" aria-describedby="url" onClick={() => void copiar()}>
          Copiar link
        </Botao>
        <Botao variante="secundario" aria-describedby="url" onClick={() => void compartilhar()}>
          Compartilhar
        </Botao>
      </div>
      {copiado === 'sim' ? (
        <p className={modulo['selo-sucesso']} role="status">
          {TEXTO_LINK_COPIADO}
        </p>
      ) : null}
      {copiado === 'falhou' ? <Faixa tipo="erro">{TEXTO_FALHA_COPIAR}</Faixa> : null}
    </section>
  );
}

function Formulario({ grupo }: { grupo: GrupoDetalhe }) {
  const editar = useEditarGrupo(grupo.id);
  const [dados, setDados] = useState<FormularioGrupo>({
    nome: grupo.nome,
    diaSemana: grupo.diaSemana,
    horario: grupo.horario,
    frequencia: grupo.frequencia,
  });
  const [erros, setErros] = useState<ErrosGrupo>({});
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [arquivar, setArquivar] = useState(false);

  function mudar<C extends keyof FormularioGrupo>(campo: C, valor: FormularioGrupo[C]) {
    setSalvo(false);
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editar.isPending) return;
    setFalha(null);
    setSalvo(false);
    // O formulário vai como está: a API valida e responde 422 por campo (GEL-19).
    editar.mutate(dados as unknown as CorpoDadosGrupo, {
      onSuccess: () => {
        setErros({});
        setSalvo(true);
      },
      onError: (erro) => {
        const porCampo = errosDoGrupo(erro);
        setErros(porCampo);
        if (Object.keys(porCampo).length === 0) setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      },
    });
  }

  return (
    <>
      {salvo ? <Faixa tipo="sucesso">{TEXTO_DADOS_SALVOS}</Faixa> : null}
      <form className={estilos.formulario} noValidate aria-busy={editar.isPending || undefined} onSubmit={enviar}>
        <ResumoErros erros={resumoDoGrupo(erros)} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <CamposGrupo dados={dados} erros={erros} mudar={mudar} />
        <div>
          <Botao type="submit" carregando={editar.isPending}>
            {editar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
      <CartaoLink link={grupo.linkPublico} />
      {grupo.souCriador ? (
        <section className={estilos.secao} aria-labelledby="arq">
          <h2 id="arq" className={estilos.subtitulo}>
            Arquivar grupo
          </h2>
          <p className={estilos.paragrafo}>{TEXTO_ZONA_ARQUIVAR}</p>
          <p className={`${estilos.paragrafo} ${estilos['texto-sec']}`}>{TEXTO_SO_VOCE}</p>
          <Botao variante="destrutivo" onClick={() => setArquivar(true)}>
            Arquivar grupo
          </Botao>
        </section>
      ) : null}
      {arquivar ? <DialogoArquivar grupo={grupo} aoFechar={() => setArquivar(false)} /> : null}
    </>
  );
}

export function DadosGrupo() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const nome = grupo.data?.nome ?? NOME_DO_APP;

  function conteudo() {
    if (grupo.isPending) return <EsqueletoLista linhas={4} />;
    if (grupo.isError) {
      if (grupo.error instanceof ErroApi && grupo.error.status === 404) {
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void grupo.refetch()} />;
    }
    return <Formulario key={grupo.data.id} grupo={grupo.data} />;
  }

  return (
    <Casca grupo={{ nome, trocarHref: '/app' }} estreita ocupada={grupo.isPending}>
      <LinkVoltar para={rotaDoGrupo(grupoId)}>Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Dados do grupo</h1>
      {conteudo()}
    </Casca>
  );
}
