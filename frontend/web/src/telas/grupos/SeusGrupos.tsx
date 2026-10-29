import type { GrupoItem } from '@pelada/contrato';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { BarraAcao } from '../../componentes/barras/BarraAcao';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { EstadoVazio } from '../../componentes/basicos/EstadoVazio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Selo } from '../../componentes/basicos/Selo';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { useGrupos, useReativarGrupo } from '../../dados/grupos';
import { useSessao } from '../../dados/sessao';
import { descreverAgenda } from '../../formatacao';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

/** Rota do formulário de novo grupo (t27). */
export const ROTA_NOVO_GRUPO = '/app/grupos/novo';

/** Aviso que outra tela deixa no `state` da navegação (ex.: dados do grupo depois de arquivar, t20). */
interface EstadoNavegacao {
  aviso?: 'arquivado';
}

const agenda = (g: GrupoItem) => descreverAgenda(g);

/** Confirmação de reativar (t08 reativar, GEL-28): o grupo volta como estava, com o mesmo link. */
function DialogoReativar({
  grupo,
  aoFechar,
  aoReativado,
}: {
  grupo: GrupoItem;
  aoFechar: () => void;
  aoReativado: () => void;
}) {
  const reativar = useReativarGrupo();
  return (
    <Dialogo
      titulo={`Reativar “${grupo.nome}”?`}
      descricao="O grupo volta como estava, com o mesmo link, e os outros admins voltam a ter acesso."
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            carregando={reativar.isPending}
            rotuloCarregando="Reativando…"
            onClick={() => reativar.mutate(grupo.id, { onSuccess: aoReativado })}
          >
            Reativar grupo
          </Botao>
        </>
      }
    >
      {reativar.isError ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

/**
 * `/app` (t08): os grupos ativos da conta, com a recorrência, e à parte os arquivados que ela criou, cada um com
 * Reativar (GEL-27, GEL-28). Sem grupo nenhum, o estado vazio com "Criar grupo" (GEL-117). O selo "Sem acesso ao
 * financeiro" vem do vínculo, que só a sessão traz (ACE-18).
 */
export function SeusGrupos() {
  const grupos = useGrupos();
  const sessao = useSessao();
  const local = useLocation();
  const avisoNavegacao = (local.state as EstadoNavegacao | null)?.aviso;
  const [reativando, setReativando] = useState<GrupoItem | null>(null);
  const [reativado, setReativado] = useState(false);

  const semFinanceiro = new Set(sessao.data?.grupos.filter((g) => !g.acessaFinanceiro).map((g) => g.id) ?? []);
  const dados = grupos.data;
  const vazio = dados !== undefined && dados.ativos.length === 0 && dados.arquivados.length === 0;

  return (
    <PaginaInterna titulo="Seus grupos" comMenu ocupado={grupos.isPending}>
      {grupos.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="bloco" quantidade={3} />
        </>
      ) : null}
      {grupos.isError ? <ErroRede aoTentar={() => void grupos.refetch()} /> : null}
      {reativado ? <Faixa tipo="sucesso">Grupo reativado.</Faixa> : null}
      {!reativado && avisoNavegacao === 'arquivado' ? <Faixa tipo="sucesso">Grupo arquivado.</Faixa> : null}
      {vazio ? (
        <EstadoVazio
          icone={null}
          titulo="Nenhum grupo ainda"
          texto="Crie o grupo da sua pelada. Se um admin convidar você, o grupo dele também aparece aqui."
          acao={<BotaoLink to={ROTA_NOVO_GRUPO}>Criar grupo</BotaoLink>}
        />
      ) : null}
      {dados && dados.ativos.length > 0 ? (
        <Lista>
          {dados.ativos.map((grupo) => (
            <Item
              key={grupo.id}
              titulo={grupo.nome}
              meta={agenda(grupo)}
              para={`/app/grupos/${grupo.id}`}
              selo={semFinanceiro.has(grupo.id) ? <Selo>Sem acesso ao financeiro</Selo> : undefined}
            />
          ))}
        </Lista>
      ) : null}
      {dados && dados.arquivados.length > 0 ? (
        <section className="secao" aria-labelledby="arquivados">
          <h2 id="arquivados" className="subtitulo">
            Arquivados
          </h2>
          <p className="paragrafo texto-sec">
            Só você, que criou estes grupos, os vê aqui. Os outros admins não têm acesso enquanto estiverem arquivados.
          </p>
          <Lista>
            {dados.arquivados.map((grupo) => (
              <Item
                key={grupo.id}
                titulo={grupo.nome}
                meta={agenda(grupo)}
                quebra
                acoes={
                  <Botao
                    variante="secundario"
                    aria-label={`Reativar ${grupo.nome}`}
                    onClick={() => {
                      setReativado(false);
                      setReativando(grupo);
                    }}
                  >
                    Reativar
                  </Botao>
                }
              />
            ))}
          </Lista>
        </section>
      ) : null}
      {dados && !vazio ? (
        <BarraAcao>
          <BotaoLink to={ROTA_NOVO_GRUPO}>Criar grupo</BotaoLink>
        </BarraAcao>
      ) : null}
      {reativando ? (
        <DialogoReativar
          grupo={reativando}
          aoFechar={() => setReativando(null)}
          aoReativado={() => {
            setReativando(null);
            setReativado(true);
          }}
        />
      ) : null}
    </PaginaInterna>
  );
}
