import { EstadoVazio } from '../../componentes/basicos/EstadoVazio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Selo } from '../../componentes/basicos/Selo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { useSessao } from '../../dados/sessao';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

/**
 * T37: `/app`, a lista dos grupos em que a pessoa tem vínculo, com o menu da conta (ACE-18, ACE-57).
 * SPEC_DEVIATION: o mockup mostra a recorrência do grupo ("Toda quinta · 20:00") sob o nome; `GET /api/sessao` não
 * devolve esse dado (ACE-18) e os grupos ainda não existem nesta feature, então a linha de apoio fica de fora.
 */
export function SeusGrupos() {
  const sessao = useSessao();
  const grupos = sessao.data?.grupos;
  return (
    <PaginaInterna titulo="Seus grupos" comMenu ocupado={sessao.isPending}>
      {sessao.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={2} />
        </>
      ) : null}
      {sessao.isError ? <ErroRede aoTentar={() => void sessao.refetch()} /> : null}
      {grupos && grupos.length === 0 ? (
        <EstadoVazio
          icone={null}
          titulo="Nenhum grupo ainda"
          texto="Quando um admin convidar você, o grupo aparece aqui."
        />
      ) : null}
      {grupos && grupos.length > 0 ? (
        <Lista>
          {grupos.map((grupo) => (
            <Item
              key={grupo.id}
              titulo={grupo.nome}
              para={`/app/grupos/${grupo.id}/admins`}
              selo={grupo.acessaFinanceiro ? undefined : <Selo>Sem acesso ao financeiro</Selo>}
            />
          ))}
        </Lista>
      ) : null}
    </PaginaInterna>
  );
}
