import { habilidadeCorpo, LIMITES, type HabilidadeItem } from '@pelada/contrato';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { EstadoVazio } from '../../componentes/basicos/EstadoVazio';
import { SeloSalvo } from '../../componentes/basicos/SeloSalvo';
import { Campo } from '../../componentes/campos/Campo';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { deErroApi, deValidacao } from '../../dados/errosDeCampos';
import { useGrupo } from '../../dados/grupos';
import {
  useCriarHabilidade,
  useExcluirHabilidade,
  useHabilidades,
  useRenomearHabilidade,
} from '../../dados/habilidades';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';
import estilos from './Habilidades.module.css';

/** Mensagem da regra do nome (GEL-90), pelo contrato: a mesma da API. */
const erroDoNome = (nome: string) => deValidacao(habilidadeCorpo.safeParse({ nome }))['nome'];

/** Confirmação de excluir (t17 excluir, GEL-94). Destrutivo: Esc não fecha e o foco começa em Cancelar. */
function DialogoExcluir({
  grupoId,
  habilidade,
  aoFechar,
}: {
  grupoId: string;
  habilidade: HabilidadeItem;
  aoFechar: () => void;
}) {
  const refCancelar = useRef<HTMLButtonElement>(null);
  const excluir = useExcluirHabilidade(grupoId);
  return (
    <Dialogo
      titulo={`Excluir “${habilidade.nome}”?`}
      descricao={`Excluir “${habilidade.nome}” apaga as notas de todos os jogadores nessa habilidade.`}
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
            carregando={excluir.isPending}
            rotuloCarregando="Excluindo…"
            onClick={() => excluir.mutate(habilidade.id, { onSuccess: aoFechar })}
          >
            Excluir habilidade
          </Botao>
        </>
      }
    >
      {excluir.isError ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

/** Uma habilidade da lista: o nome muda na própria linha e grava ao sair do campo ou com Enter (GEL-92). */
function LinhaHabilidade({
  grupoId,
  habilidade,
  numero,
  aoExcluir,
}: {
  grupoId: string;
  habilidade: HabilidadeItem;
  numero: number;
  aoExcluir: () => void;
}) {
  const [nome, setNome] = useState(habilidade.nome);
  const [erro, setErro] = useState<string | undefined>();
  const [salvo, setSalvo] = useState(false);
  const renomear = useRenomearHabilidade(grupoId);
  const id = `habilidade-${habilidade.id}`;

  const gravar = () => {
    if (nome.trim() === habilidade.nome) {
      setNome(habilidade.nome);
      setErro(undefined);
      return;
    }
    const invalido = erroDoNome(nome);
    setErro(invalido);
    if (invalido) return;
    setSalvo(false);
    renomear.mutate(
      { id: habilidade.id, nome: nome.trim() },
      {
        onSuccess: (nova) => {
          setNome(nova.nome);
          setSalvo(true);
        },
        onError: (e) => setErro(deErroApi(e)?.['nome'] ?? 'Não foi possível salvar. Verifique a conexão.'),
      },
    );
  };

  return (
    <Item
      quebra
      titulo={
        <>
          <label className="sr" htmlFor={id}>
            Nome da habilidade {numero}
          </label>
          <input
            id={id}
            className={`${estilos.nome} ${erro ? estilos.comErro : ''}`}
            maxLength={LIMITES.habilidade.max}
            value={nome}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(e) => {
              setSalvo(false);
              setErro(undefined);
              setNome(e.target.value);
            }}
            onBlur={gravar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                gravar();
              }
            }}
          />
          {erro ? (
            <span id={`${id}-erro`} className={estilos.erro} role="alert">
              {erro}
            </span>
          ) : null}
        </>
      }
      acoes={
        <>
          {salvo ? <SeloSalvo /> : null}
          <Botao variante="textoDestrutivo" onClick={aoExcluir}>
            Excluir <span className="sr">{habilidade.nome}</span>
          </Botao>
        </>
      }
    />
  );
}

function NovaHabilidade({ grupoId }: { grupoId: string }) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | undefined>();
  const criar = useCriarHabilidade(grupoId);

  const adicionar = () => {
    const invalido = erroDoNome(nome);
    setErro(invalido);
    if (invalido) return;
    criar.mutate(nome.trim(), {
      onSuccess: () => setNome(''),
      onError: (e) => setErro(deErroApi(e)?.['nome']),
    });
  };
  const falhaDeEnvio = criar.isError && deErroApi(criar.error) === null;
  return (
    <Formulario aoEnviar={adicionar} enviando={criar.isPending} classe="secao">
      {falhaDeEnvio ? <ErroEnvio /> : null}
      <Campo
        id="nova"
        rotulo="Nova habilidade"
        erro={erro}
        erroComoAlerta
        lado={
          <Botao type="submit" carregando={criar.isPending} rotuloCarregando="Adicionando…">
            Adicionar
          </Botao>
        }
      >
        {(entrada) => (
          <input
            {...entrada}
            maxLength={LIMITES.habilidade.max}
            value={nome}
            onChange={(e) => {
              setErro(undefined);
              setNome(e.target.value);
            }}
          />
        )}
      </Campo>
    </Formulario>
  );
}

/**
 * `/app/grupos/:grupoId/habilidades` (t17): lista na ordem de cadastro, com renomear na linha, excluir com
 * confirmação e "Nova habilidade" (GEL-88 a GEL-95). Sem habilidades, "Nenhuma habilidade" e o nível 5,5 do simulador.
 */
export function Habilidades() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const habilidades = useHabilidades(grupoId);
  const [excluindo, setExcluindo] = useState<HabilidadeItem | null>(null);
  const lista = habilidades.data?.habilidades;

  return (
    <PaginaInterna
      titulo="Habilidades"
      {...(grupo.data ? { nomeGrupo: grupo.data.nome } : {})}
      destinoTrocarGrupo="/app"
      voltarPara={`/app/grupos/${grupoId}`}
      voltarRotulo="Início"
      ocupado={habilidades.isPending}
    >
      {habilidades.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={4} />
        </>
      ) : null}
      {habilidades.isError ? <ErroRede aoTentar={() => void habilidades.refetch()} /> : null}
      {lista && lista.length === 0 ? (
        <EstadoVazio icone={null} titulo="Nenhuma habilidade" texto="O simulador vai usar nível 5,5 para todos." />
      ) : null}
      {lista && lista.length > 0 ? (
        <Lista>
          {lista.map((h, i) => (
            <LinhaHabilidade
              key={h.id}
              grupoId={grupoId}
              habilidade={h}
              numero={i + 1}
              aoExcluir={() => setExcluindo(h)}
            />
          ))}
        </Lista>
      ) : null}
      {lista ? <NovaHabilidade grupoId={grupoId} /> : null}
      {excluindo ? (
        <DialogoExcluir grupoId={grupoId} habilidade={excluindo} aoFechar={() => setExcluindo(null)} />
      ) : null}
    </PaginaInterna>
  );
}
