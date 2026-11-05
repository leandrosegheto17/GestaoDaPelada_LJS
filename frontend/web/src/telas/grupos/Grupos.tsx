import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { CascaConta } from '../../componentes/MenuConta.tsx';
import { useSessao } from '../../app/guarda.tsx';
import { destinoDoGrupo } from '../convite/Convite.tsx';
import estilos from '../acesso.module.css';

/**
 * Lista de grupos (`/app`, t08; ACE-18, ACE-56, ACE-57):
 * - os grupos vêm de `GET /api/sessao` (a `GuardaApp` já leu a sessão: a tela não faz outra
 *   consulta); cada um é um link para `/app/grupos/:grupoId/admins`, a única rota de grupo até
 *   a `grupos-e-elenco` (AD-022); grupo sem acesso ao financeiro leva o selo
 *   "Sem acesso ao financeiro" (`t08-grupos--sucesso`);
 * - sem grupos, o estado vazio "Nenhum grupo ainda" (`t08-grupos--vazio`, ACE-57);
 * - o menu da conta fica na barra (`CascaConta`, T50; Sair é o ACE-17).
 */

export const TITULO_VAZIO = 'Nenhum grupo ainda';
export const TEXTO_VAZIO = 'Quando um admin convidar você, o grupo aparece aqui.';

export function Grupos() {
  const { data } = useSessao();
  const grupos = data?.tipo === 'ativa' ? data.sessao.grupos : [];

  return (
    <CascaConta titulo="Seus grupos" estreita>
      {grupos.length === 0 ? (
        <div className={estilos.vazio}>
          <h2 className={estilos['vazio__titulo']}>{TITULO_VAZIO}</h2>
          <p className={estilos['vazio__texto']}>{TEXTO_VAZIO}</p>
        </div>
      ) : (
        <Lista rotulo="Seus grupos">
          {grupos.map((g) => (
            <ItemLista
              key={g.id}
              titulo={g.nome}
              meta={g.acessaFinanceiro ? undefined : <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>Sem acesso ao financeiro</span>}
              para={destinoDoGrupo(g.id)}
              seta
            />
          ))}
        </Lista>
      )}
    </CascaConta>
  );
}
