import { useState } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { useContextoSimulador, usePreviaSimulador } from '../../dados/simulador.ts';
import acesso from '../acesso.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { corpoDaPrevia, EntradasSimulador, entradasIniciais, type Entradas } from './EntradasSimulador.tsx';
import { ID_PREVIA_ERRO, podeSugerir, PreviaSimulador, previaInvalida } from './PreviaSimulador.tsx';
import estilos from './simulador.module.css';

/**
 * Simulador (`/app/grupos/:grupoId/simulador`, t12; simulador T45; SIM-05 a SIM-07), no molde de `PaginaNovaPartida`
 * (`telas/partida/PaginaNovaPartida.tsx`):
 * - abre no contexto da API (data sugerida, ativos com nível); trocar a data relê os ativos dessa data (SIM-02) e
 *   mantém formato, N e K; os aptos voltam a ser todos os ativos da nova data;
 * - sem ativos na data: "Sem jogadores", "Cadastre jogadores para usar o simulador." e "Cadastrar jogadores" (SIM-07);
 * - a prévia (T46; SIM-14, SIM-15) é pedida à API com debounce a cada mudança de formato, N, K ou aptos; "Sugerir
 *   times" só fica ativo com ela válida;
 * - o resultado (T47, T48) e as ações (T49, T50) entram nas tarefas seguintes.
 */

export const TEXTO_SEM_JOGADORES = 'Sem jogadores';

/** Data completa no campo (`aaaa-mm-dd`); a tela do simulador não importa o domínio (SIM-15). */
function dataCompletaNoCampo(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}
export const TEXTO_SEM_JOGADORES_AJUDA = 'Cadastre jogadores para usar o simulador.';

export function PaginaSimulador() {
  const { grupoId = '' } = useParams();
  const base = rotaDoGrupo(grupoId);
  const grupo = useGrupo(grupoId);

  /** Data consultada: `undefined` é a sugerida pela API. */
  const [dataConsultada, setDataConsultada] = useState<string | undefined>(undefined);
  const contexto = useContextoSimulador(grupoId, dataConsultada);
  /** As entradas, criadas do contexto na primeira leitura de cada data. */
  const [entradas, setEntradas] = useState<Entradas | null>(null);
  const [dataDasEntradas, setDataDasEntradas] = useState<string | null>(null);

  const ctx = contexto.data;
  const dataDoCtx = dataConsultada ?? ctx?.dataSugerida ?? null;
  if (ctx && dataDoCtx !== null && dataDasEntradas !== dataDoCtx) {
    // Ajuste de estado durante a renderização (padrão do React para estado derivado de uma consulta).
    const iniciais = entradasIniciais(ctx, dataDoCtx);
    setEntradas(entradas ? { ...iniciais, formato: entradas.formato, n: entradas.n, k: entradas.k, ilimitado: entradas.ilimitado } : iniciais);
    setDataDasEntradas(dataDoCtx);
  }

  // A prévia não depende da data (SIM-09): mudar só a data não pede outra.
  const corpoPrevia = ctx && entradas ? corpoDaPrevia(entradas, ctx) : null;
  const previa = usePreviaSimulador(grupoId, corpoPrevia);

  function trocarData(valor: string) {
    if (entradas) setEntradas({ ...entradas, data: valor });
    if (dataCompletaNoCampo(valor)) setDataConsultada(valor);
  }

  function conteudo() {
    if (contexto.isError && ctx === undefined) {
      if (contexto.error instanceof ErroApi && contexto.error.status === 404) return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void contexto.refetch()} />;
    }
    if (!ctx || !entradas) return <EsqueletoLista rotulo="Carregando os jogadores ativos…" />;

    if (ctx.jogadores.length === 0) {
      return (
        <div className={acesso.vazio} role="status">
          <h2 className={acesso['vazio__titulo']}>{TEXTO_SEM_JOGADORES}</h2>
          <p className={acesso['vazio__texto']}>{TEXTO_SEM_JOGADORES_AJUDA}</p>
          <LinkBotao para={`${base}/jogadores/novo`} variante="principal">
            Cadastrar jogadores
          </LinkBotao>
        </div>
      );
    }

    return (
      <EntradasSimulador
        contexto={ctx}
        entradas={entradas}
        aoMudar={setEntradas}
        aoTrocarData={trocarData}
        previa={<PreviaSimulador estado={previa.estado} aoTentarDeNovo={previa.tentarDeNovo} />}
        acao={
          <div className={estilos['barra-acao']}>
            {/* O envio vem com o resultado (T47). */}
            <Botao
              variante="principal"
              type="button"
              disabled={!podeSugerir(previa.estado)}
              aria-describedby={previaInvalida(previa.estado) ? ID_PREVIA_ERRO : undefined}
            >
              Sugerir times
            </Botao>
          </div>
        }
      />
    );
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} titulo="Simulador">
      <LinkVoltar para={base}>Início</LinkVoltar>
      {conteudo()}
    </Casca>
  );
}
