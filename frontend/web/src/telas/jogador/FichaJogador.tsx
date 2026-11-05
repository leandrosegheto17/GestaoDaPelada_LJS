import type { EditarJogadorCorpo, JogadorDetalhe } from '@pelada/contrato/elenco';
import { formatarData } from '@pelada/dominio';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoNota } from '../../componentes/CampoNota.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useEditarJogador, useJogador } from '../../dados/elenco.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { exibirNivel, TEXTO_SEM_NOTA, useSalvarNota } from '../../dados/habilidades.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import estilos from '../acesso.module.css';
import listas from '../../componentes/Lista.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import {
  CamposJogador,
  errosDoJogador,
  numeroOuNulo,
  resumoDoJogador,
  type ErrosJogador,
  type FormularioJogador,
} from './camposJogador.tsx';
import { AcoesSituacao } from './PeriodosJogador.tsx';

/**
 * Ficha do jogador (`/app/grupos/:grupoId/jogadores/:jogadorId`, t16; GEL-41, GEL-97, GEL-98,
 * GEL-103, GEL-114), de `t16-jogador--edicao.html` e `t16-jogador--carregando.html`:
 * - "Dados": os campos do cadastro sem a data de entrada (GEL-41: ela muda pela rota de início);
 *   a data de início da pontuação aparece só para leitura; "Salvar" envia `PATCH` sem
 *   `dataEntrada` e mostra "Dados salvos."; 422 marca os campos com o resumo;
 * - "Habilidades e nível": o nível ("Nível 6,8", ou "sem nota") e uma `CampoNota` por
 *   habilidade; mudar a nota grava na hora (`useSalvarNota`, T55) e o nível vem da resposta
 *   (GEL-97); "–" apaga a nota (GEL-98);
 * - "Situação": "Ativo desde dd/mm/aaaa." e os períodos de atividade, do mais antigo ao atual,
 *   com Inativar ou Reativar (`AcoesSituacao`, T65); o aviso de sucesso fica no topo da ficha.
 *   As ações de período e a exclusão entram nas T66 e T67, pelos encaixes `acoesPeriodo`,
 *   `acaoInicio` e `acaoExcluir`.
 */

export const TEXTO_DADOS_SALVOS = 'Dados salvos.';

export function textoNivel(ficha: Pick<JogadorDetalhe, 'nivel' | 'semNota'>): string {
  return ficha.semNota ? TEXTO_SEM_NOTA : `Nível ${exibirNivel(ficha.nivel, false)}`;
}

export function textoSituacao(ficha: Pick<JogadorDetalhe, 'situacao' | 'desde'>): string {
  return `${ficha.situacao === 'ativo' ? 'Ativo' : 'Inativo'} desde ${formatarData(ficha.desde)}.`;
}

export function telefoneNaTela(digitos: string | null): string {
  if (!digitos) return '';
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

/** Corpo do `PATCH`: os campos editáveis, nunca `dataEntrada` (GEL-41). */
export function corpoDaEdicao(dados: FormularioJogador): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    apelido: dados.apelido,
    anoNascimento: numeroOuNulo(dados.anoNascimento),
    posicao: dados.posicao,
    telefone: dados.telefone.trim() === '' ? null : dados.telefone,
  };
  if (dados.pontuacaoInicial.trim() !== '') corpo.pontuacaoInicial = numeroOuNulo(dados.pontuacaoInicial);
  return corpo;
}

export interface EncaixesFicha {
  /** Botão "Alterar data de início" (T66). */
  acaoInicio?: (ficha: JogadorDetalhe) => ReactNode;
  /** Ação de cada período ("Corrigir datas", T66). */
  acoesPeriodo?: (ficha: JogadorDetalhe, periodo: JogadorDetalhe['periodos'][number], indice: number) => ReactNode;
  /** Botão "Excluir jogador" (T67), que recebe como abrir o diálogo de inativar. */
  acaoExcluir?: (ficha: JogadorDetalhe, abrirInativar: () => void) => ReactNode;
}

function Dados({ grupoId, ficha, acaoInicio }: { grupoId: string; ficha: JogadorDetalhe; acaoInicio?: EncaixesFicha['acaoInicio'] }) {
  const editar = useEditarJogador(grupoId, ficha.id);
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [dados, setDados] = useState<FormularioJogador>({
    apelido: ficha.apelido,
    anoNascimento: ficha.anoNascimento === null ? '' : String(ficha.anoNascimento),
    posicao: ficha.posicao,
    telefone: telefoneNaTela(ficha.telefone),
    dataEntrada: '',
    pontuacaoInicial: String(ficha.pontuacaoInicial),
  });
  const [erros, setErros] = useState<ErrosJogador>({});
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  function mudar<C extends keyof FormularioJogador>(campo: C, valor: FormularioJogador[C]) {
    setSalvo(false);
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editar.isPending) return;
    setFalha(null);
    setSalvo(false);
    editar.mutate(corpoDaEdicao(dados) as unknown as EditarJogadorCorpo, {
      onSuccess: () => {
        setErros({});
        setSalvo(true);
      },
      onError: (erro) => {
        const porCampo = errosDoJogador(erro);
        setErros(porCampo);
        if (Object.keys(porCampo).length === 0) setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      },
    });
  }

  return (
    <section aria-labelledby="s-dados">
      <h2 id="s-dados" className={estilos.subtitulo}>
        Dados
      </h2>
      {salvo ? <Faixa tipo="sucesso">{TEXTO_DADOS_SALVOS}</Faixa> : null}
      <form className={estilos.formulario} noValidate aria-busy={editar.isPending || undefined} onSubmit={enviar}>
        <ResumoErros erros={resumoDoJogador(erros)} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <CamposJogador dados={dados} erros={erros} mudar={mudar} hoje={hoje} comDataEntrada={false} />
        <div>
          <span className={estilos.ajuda}>Data de início</span>
          <p className={estilos.paragrafo} id="inicio-valor">
            {formatarData(ficha.inicioPontuacao)}
          </p>
          {acaoInicio ? <div>{acaoInicio(ficha)}</div> : null}
        </div>
        <div>
          <Botao type="submit" carregando={editar.isPending}>
            {editar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </section>
  );
}

function Notas({ grupoId, ficha }: { grupoId: string; ficha: JogadorDetalhe }) {
  const salvar = useSalvarNota(grupoId, ficha.id);
  const [falhas, setFalhas] = useState<Record<string, string>>({});

  function mudar(habilidadeId: string, nota: number | null) {
    setFalhas((f) => {
      const { [habilidadeId]: _removida, ...resto } = f;
      return resto;
    });
    salvar.mutate(
      { habilidadeId, nota },
      {
        onError: (erro) =>
          setFalhas((f) => ({ ...f, [habilidadeId]: erro instanceof ErroApi ? erro.message : MENSAGEM_REDE })),
      },
    );
  }

  return (
    <section className={estilos.secao} aria-labelledby="s-hab">
      <h2 id="s-hab" className={estilos.subtitulo}>
        Habilidades e nível
      </h2>
      <p className={modulo.nivel} aria-live="polite">
        {textoNivel(ficha)}
      </p>
      {ficha.notas.length === 0 ? (
        <p className={estilos.paragrafo}>O grupo não tem habilidades.</p>
      ) : (
        <ul className={listas.lista} aria-labelledby="s-hab">
          {ficha.notas.map((n, i) => (
            <li key={n.habilidadeId} className={listas.item}>
              <CampoNota
                id={`h${i + 1}`}
                rotulo={n.habilidade}
                valor={n.nota}
                erro={falhas[n.habilidadeId]}
                aoMudar={(nota) => mudar(n.habilidadeId, nota)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Situacao({
  grupoId,
  ficha,
  encaixes,
  avisar,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  encaixes: EncaixesFicha;
  avisar: (texto: string | null) => void;
}) {
  return (
    <section className={estilos.secao} aria-labelledby="s-sit">
      <h2 id="s-sit" className={estilos.subtitulo}>
        Situação
      </h2>
      <div className={estilos.formulario}>
        <p className={estilos.paragrafo}>{textoSituacao(ficha)}</p>
        <div>
          <span className={estilos.ajuda} id="s-per">
            Períodos de atividade
          </span>
          <ul className={listas.lista} aria-labelledby="s-per">
            {ficha.periodos.map((p, i) => (
              <li key={p.id} className={`${listas.item} ${modulo['item-quebra']}`}>
                <div className={listas['item__principal']}>
                  <span className={listas['item__titulo']} id={`p${i + 1}-t`}>
                    {formatarData(p.inicio)} <span aria-hidden="true">→</span>
                    <span className="sr">até</span> {p.fim === null ? 'atual' : formatarData(p.fim)}
                  </span>
                  {i === 0 ? <span className={listas['item__meta']}>Entrada</span> : null}
                </div>
                {encaixes.acoesPeriodo ? encaixes.acoesPeriodo(ficha, p, i) : null}
              </li>
            ))}
          </ul>
        </div>
        <AcoesSituacao
          grupoId={grupoId}
          ficha={ficha}
          avisar={avisar}
          acaoExtra={encaixes.acaoExcluir ? (abrirInativar) => encaixes.acaoExcluir?.(ficha, abrirInativar) : undefined}
        />
      </div>
    </section>
  );
}

function Carregando() {
  return (
    <>
      <h1 className={estilos['titulo-pagina']}>
        <span className="sr">Jogador</span>
        <span className={modulo['esqueleto-titulo']} aria-hidden="true" />
      </h1>
      <p className="sr" role="status">
        Carregando…
      </p>
      <div aria-hidden="true">
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--botao']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--botao']}`} />
      </div>
    </>
  );
}

export function FichaJogador({ encaixes = {} }: { encaixes?: EncaixesFicha }) {
  const { grupoId = '', jogadorId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const ficha = useJogador(grupoId, jogadorId);
  const base = rotaDoGrupo(grupoId);
  const [aviso, setAviso] = useState<string | null>(null);

  function conteudo() {
    if (ficha.isPending) return <Carregando />;
    if (ficha.isError) {
      return (
        <>
          <h1 className={estilos['titulo-pagina']}>Jogador</h1>
          {ficha.error instanceof ErroApi && ficha.error.status === 404 ? (
            <Faixa tipo="atencao">Jogador não encontrado.</Faixa>
          ) : (
            <EstadoErro aoTentarDeNovo={() => void ficha.refetch()} />
          )}
        </>
      );
    }
    const f = ficha.data;
    return (
      <>
        <h1 className={estilos['titulo-pagina']}>{f.apelido}</h1>
        {aviso ? <Faixa tipo="sucesso">{aviso}</Faixa> : null}
        <Dados key={`dados-${f.id}`} grupoId={grupoId} ficha={f} acaoInicio={encaixes.acaoInicio} />
        <Notas grupoId={grupoId} ficha={f} />
        <Situacao grupoId={grupoId} ficha={f} encaixes={encaixes} avisar={setAviso} />
      </>
    );
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} estreita ocupada={ficha.isPending}>
      <LinkVoltar para={`${base}/jogadores`}>Jogadores</LinkVoltar>
      {conteudo()}
    </Casca>
  );
}
