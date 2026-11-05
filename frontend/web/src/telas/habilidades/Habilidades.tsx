import type { HabilidadeItem } from '@pelada/contrato/periodos';
import { LIMITES_HABILIDADE } from '@pelada/contrato/periodos';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import listas from '../../componentes/Lista.module.css';
import estilosCampo from '../../componentes/Campo.module.css';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useGrupo } from '../../dados/grupos.ts';
import {
  useCriarHabilidade,
  useExcluirHabilidade,
  useHabilidades,
  useRenomearHabilidade,
} from '../../dados/habilidades.ts';
import estilos from '../acesso.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';

/**
 * Habilidades (`/app/grupos/:grupoId/habilidades`, t17; GEL-89 a GEL-95, GEL-114), de
 * `.specs/mockup/telas/t17-habilidades--{sucesso,vazio,erro,excluir}.html`:
 * - a lista na ordem da API; cada nome é um campo (rótulo só para o leitor de tela) que renomeia
 *   ao sair do campo ou com Enter, quando mudou (`PATCH`, GEL-92); erro do nome logo abaixo;
 * - "Excluir" abre o `alertdialog` "Excluir “<nome>”?" com o texto exato (GEL-94);
 * - "Nova habilidade" com "Adicionar" (`POST`, GEL-89); 422 (nome curto ou repetido, GEL-90,
 *   GEL-91) mostra a mensagem no campo (`t17-habilidades--erro`);
 * - sem habilidades, "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos." (GEL-95);
 * - carregando e erro com "Tentar de novo".
 */

export const TITULO_SEM_HABILIDADES = 'Nenhuma habilidade';
export const TEXTO_SEM_HABILIDADES = 'O simulador vai usar nível 5,5 para todos.';
export const tituloExcluirHabilidade = (nome: string) => `Excluir “${nome}”?`;
export const textoExcluirHabilidade = (nome: string) =>
  `Excluir “${nome}” apaga as notas de todos os jogadores nessa habilidade.`;

function mensagemDoNome(erro: unknown): { campo?: string; faixa?: string } {
  const campo = mensagensDosCampos(erro).nome;
  if (campo) return { campo };
  return { faixa: erro instanceof ErroApi ? erro.message : MENSAGEM_REDE };
}

function ItemHabilidade({
  grupoId,
  habilidade,
  indice,
  aoExcluir,
}: {
  grupoId: string;
  habilidade: HabilidadeItem;
  indice: number;
  aoExcluir: () => void;
}) {
  const renomear = useRenomearHabilidade(grupoId);
  const [nome, setNome] = useState(habilidade.nome);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const id = `h${indice + 1}`;

  function salvar() {
    if (nome === habilidade.nome || renomear.isPending) return;
    setErro(undefined);
    renomear.mutate(
      { id: habilidade.id, dados: { nome } },
      {
        onError: (e) => {
          const { campo, faixa } = mensagemDoNome(e);
          setErro(campo ?? faixa);
        },
      },
    );
  }

  return (
    <li className={listas.item}>
      <label className="sr" htmlFor={id}>
        {`Nome da habilidade ${indice + 1}`}
      </label>
      <input
        id={id}
        className={`${estilosCampo['campo__entrada']} ${listas['item__principal']}`}
        maxLength={LIMITES_HABILIDADE.nomeMax}
        autoComplete="off"
        value={nome}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            salvar();
          }
        }}
      />
      <Botao variante="texto-destrutivo" onClick={aoExcluir}>
        Excluir<span className="sr">{` ${habilidade.nome}`}</span>
      </Botao>
      {erro ? (
        <p className={estilosCampo['campo__erro']} id={`${id}-erro`}>
          {erro}
        </p>
      ) : null}
    </li>
  );
}

function DialogoExcluir({
  grupoId,
  habilidade,
  aoFechar,
}: {
  grupoId: string;
  habilidade: HabilidadeItem;
  aoFechar: () => void;
}) {
  const excluir = useExcluirHabilidade(grupoId);
  const [falha, setFalha] = useState<string | null>(null);
  return (
    <Dialogo
      alerta
      titulo={tituloExcluirHabilidade(habilidade.nome)}
      descricao={textoExcluirHabilidade(habilidade.nome)}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" autoFocus onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="destrutivo"
            carregando={excluir.isPending}
            onClick={() => {
              if (excluir.isPending) return;
              setFalha(null);
              excluir.mutate(habilidade.id, {
                onSuccess: aoFechar,
                onError: (e) => setFalha(e instanceof ErroApi ? e.message : MENSAGEM_REDE),
              });
            }}
          >
            Excluir habilidade
          </Botao>
        </>
      }
    >
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
    </Dialogo>
  );
}

export function Habilidades() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const lista = useHabilidades(grupoId);
  const criar = useCriarHabilidade(grupoId);
  const [nova, setNova] = useState('');
  const [erroNova, setErroNova] = useState<string | undefined>(undefined);
  const [excluir, setExcluir] = useState<HabilidadeItem | null>(null);

  function adicionar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (criar.isPending) return;
    setErroNova(undefined);
    criar.mutate(
      { nome: nova },
      {
        onSuccess: () => setNova(''),
        onError: (erro) => {
          const { campo, faixa } = mensagemDoNome(erro);
          setErroNova(campo ?? faixa);
        },
      },
    );
  }

  function conteudo() {
    if (lista.isPending) return <EsqueletoLista linhas={6} />;
    if (lista.isError) {
      if (lista.error instanceof ErroApi && lista.error.status === 404) {
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void lista.refetch()} />;
    }
    const { habilidades } = lista.data;
    return (
      <>
        {habilidades.length === 0 ? (
          <div className={estilos.vazio}>
            <h2 className={estilos['vazio__titulo']}>{TITULO_SEM_HABILIDADES}</h2>
            <p className={estilos['vazio__texto']}>{TEXTO_SEM_HABILIDADES}</p>
          </div>
        ) : (
          <ul className={listas.lista} aria-label="Habilidades">
            {habilidades.map((h, i) => (
              <ItemHabilidade
                key={`${h.id}-${h.nome}`}
                grupoId={grupoId}
                habilidade={h}
                indice={i}
                aoExcluir={() => setExcluir(h)}
              />
            ))}
          </ul>
        )}
        <form
          className={`${estilos.formulario} ${estilos.secao}`}
          noValidate
          aria-busy={criar.isPending || undefined}
          onSubmit={adicionar}
        >
          <Campo
            id="nova"
            rotulo="Nova habilidade"
            maxLength={LIMITES_HABILIDADE.nomeMax}
            autoComplete="off"
            erro={erroNova}
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            lateral={
              <Botao type="submit" carregando={criar.isPending}>
                Adicionar
              </Botao>
            }
          />
        </form>
      </>
    );
  }

  return (
    <Casca
      grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}
      estreita
      ocupada={lista.isPending}
    >
      <LinkVoltar para={rotaDoGrupo(grupoId)}>Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Habilidades</h1>
      {conteudo()}
      {excluir ? (
        <DialogoExcluir grupoId={grupoId} habilidade={excluir} aoFechar={() => setExcluir(null)} />
      ) : null}
    </Casca>
  );
}
