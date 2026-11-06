import type { GrupoItem } from '@pelada/contrato/grupo';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { useSessao } from '../../app/guarda.tsx';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { CascaConta } from '../../componentes/MenuConta.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useGrupos, useReativarGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { textoRecorrencia } from './recorrencia.ts';

/**
 * Seus grupos (`/app`, t08; GEL-27, GEL-114, GEL-117), estendida da tela da CA (ACE-18, ACE-57):
 * - os grupos vêm de `GET /api/grupos` (`useGrupos`, T53): os ativos, cada um com a recorrência
 *   e link para o início do grupo (`/app/grupos/:grupoId`, t09); o selo "Sem acesso ao
 *   financeiro" continua, lido da sessão (`acessaFinanceiro` é do vínculo, não do grupo);
 * - a seção "Arquivados" só aparece com grupos arquivados, que a API só devolve à criadora
 *   (GEL-27), cada um com "Reativar" e o diálogo de confirmação (`t08-grupos--reativar`,
 *   GEL-28); reativado, a faixa "Grupo reativado." (`t08-grupos--reativado`);
 * - quem chega da t20 depois de arquivar vê "Grupo arquivado." (`t08-grupos--arquivado`,
 *   estado de navegação `{ aviso: 'grupo-arquivado' }`, T61);
 * - "Criar grupo" na barra de ação; sem grupo nenhum, o estado vazio com a mesma ação
 *   (`t08-grupos--vazio`, GEL-117);
 * - carregando (`t08-grupos--carregando`) e erro com "Tentar de novo" (`t08-grupos--erro`).
 */

export const TITULO_VAZIO = 'Nenhum grupo ainda';
export const TEXTO_VAZIO =
  'Crie o grupo da sua pelada. Se um admin convidar você, o grupo dele também aparece aqui.';
export const TITULO_ARQUIVADOS = 'Arquivados';
export const TEXTO_ARQUIVADOS =
  'Só você, que criou estes grupos, os vê aqui. Os outros admins não têm acesso enquanto estiverem arquivados.';
export const TEXTO_SEM_FINANCEIRO = 'Sem acesso ao financeiro';
export const TEXTO_GRUPO_ARQUIVADO = 'Grupo arquivado.';
export const TEXTO_GRUPO_REATIVADO = 'Grupo reativado.';
export const ROTA_NOVO_GRUPO = '/app/grupos/novo';
export const AVISO_GRUPO_ARQUIVADO = 'grupo-arquivado';

export const tituloReativar = (nome: string) => `Reativar “${nome}”?`;
export const TEXTO_REATIVAR =
  'O grupo volta como estava, com o mesmo link, e os outros admins voltam a ter acesso.';

export function rotaDoGrupo(grupoId: string): string {
  return `/app/grupos/${encodeURIComponent(grupoId)}`;
}

function DialogoReativar({
  grupo,
  aoFechar,
  aoReativar,
  aoFalhar,
}: {
  grupo: GrupoItem;
  aoFechar: () => void;
  aoReativar: () => void;
  aoFalhar: (mensagem: string) => void;
}) {
  const reativar = useReativarGrupo(grupo.id);
  return (
    <Dialogo
      titulo={tituloReativar(grupo.nome)}
      descricao={TEXTO_REATIVAR}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" autoFocus onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            carregando={reativar.isPending}
            onClick={() => {
              if (reativar.isPending) return;
              reativar.mutate(undefined, {
                onSuccess: aoReativar,
                onError: (erro) => aoFalhar(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE),
              });
            }}
          >
            Reativar grupo
          </Botao>
        </>
      }
    />
  );
}

export function Grupos() {
  const grupos = useGrupos();
  const sessao = useSessao();
  const local = useLocation();
  const [reativar, setReativar] = useState<GrupoItem | null>(null);
  const [aviso, setAviso] = useState<string | null>(() =>
    (local.state as { aviso?: string } | null)?.aviso === AVISO_GRUPO_ARQUIVADO
      ? TEXTO_GRUPO_ARQUIVADO
      : null,
  );
  const [falha, setFalha] = useState<string | null>(null);

  const vinculos = sessao.data?.tipo === 'ativa' ? sessao.data.sessao.grupos : [];
  const semFinanceiro = new Set(vinculos.filter((v) => !v.acessaFinanceiro).map((v) => v.id));

  function conteudo() {
    if (grupos.isPending) return <EsqueletoLista linhas={3} />;
    if (grupos.isError) return <EstadoErro aoTentarDeNovo={() => void grupos.refetch()} />;
    const { ativos, arquivados } = grupos.data;

    if (ativos.length === 0 && arquivados.length === 0) {
      return (
        <div className={estilos.vazio}>
          <h2 className={estilos['vazio__titulo']}>{TITULO_VAZIO}</h2>
          <p className={estilos['vazio__texto']}>{TEXTO_VAZIO}</p>
          <LinkBotao para={ROTA_NOVO_GRUPO} variante="principal">
            Criar grupo
          </LinkBotao>
        </div>
      );
    }

    return (
      <>
        {ativos.length > 0 ? (
          <Lista rotulo="Seus grupos">
            {ativos.map((g) => (
              <ItemLista
                key={g.id}
                titulo={g.nome}
                meta={
                  <>
                    {textoRecorrencia(g)}
                    {semFinanceiro.has(g.id) ? (
                      <>
                        <br />
                        <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>
                          {TEXTO_SEM_FINANCEIRO}
                        </span>
                      </>
                    ) : null}
                  </>
                }
                para={rotaDoGrupo(g.id)}
                seta
              />
            ))}
          </Lista>
        ) : null}

        {arquivados.length > 0 ? (
          <section className={estilos.secao} aria-labelledby="arq">
            <h2 id="arq" className={estilos.subtitulo}>
              {TITULO_ARQUIVADOS}
            </h2>
            <p className={`${estilos.paragrafo} ${estilos['texto-sec']}`}>{TEXTO_ARQUIVADOS}</p>
            <Lista rotulo={TITULO_ARQUIVADOS}>
              {arquivados.map((g) => (
                <ItemLista
                  key={g.id}
                  titulo={g.nome}
                  meta={textoRecorrencia(g)}
                  quebra
                  lateral={
                    <Botao
                      variante="secundario"
                      aria-label={`Reativar ${g.nome}`}
                      onClick={() => setReativar(g)}
                    >
                      Reativar
                    </Botao>
                  }
                />
              ))}
            </Lista>
          </section>
        ) : null}

        <div className={modulo['reserva-barra']} aria-hidden="true" />
        <div className={modulo['barra-acao']}>
          <LinkBotao para={ROTA_NOVO_GRUPO} variante="principal">
            Criar grupo
          </LinkBotao>
        </div>
      </>
    );
  }

  return (
    <CascaConta titulo="Seus grupos" estreita ocupada={grupos.isPending}>
      {aviso ? <Faixa tipo="sucesso">{aviso}</Faixa> : null}
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      {conteudo()}
      {reativar ? (
        <DialogoReativar
          grupo={reativar}
          aoFechar={() => setReativar(null)}
          aoReativar={() => {
            setReativar(null);
            setFalha(null);
            setAviso(TEXTO_GRUPO_REATIVADO);
          }}
          aoFalhar={(mensagem) => {
            setReativar(null);
            setAviso(null);
            setFalha(mensagem);
          }}
        />
      ) : null}
    </CascaConta>
  );
}
