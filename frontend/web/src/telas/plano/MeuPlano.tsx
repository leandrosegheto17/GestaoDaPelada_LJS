import type { PlanoResposta } from '@pelada/contrato/plano';
import { RECURSOS, type Recurso } from '@pelada/dominio';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { NOMES_RECURSOS_PRO } from '../../componentes/AvisoRecursoPro.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { usePlano } from '../../dados/plano.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { AssinarPro } from './AssinarPro.tsx';
import { AssinaturaAtual } from './AssinaturaAtual.tsx';
import { dataBr } from './datas.ts';

/**
 * Meu plano (`/app/grupos/:grupoId/plano`; planos-e-cobranca T44; PLA-52, PLA-57, PLA-58; AD-063, AD-064). Sem mockup
 * de módulo: as peças do guia (casca do admin, cartão, lista, faixa), só com tokens. O que a tela mostra vem todo do
 * `GET …/plano` (o plano é decidido na API, PLA-07):
 * - o nome do plano: "Free", "Trial Pro", "Pro" ou "Cortesia: Pro sem cobrança";
 * - a data: "Trial Pro até dd/mm/aaaa" no trial; "Pro até dd/mm/aaaa" com `pagoAte` no Pro;
 * - os jogadores ativos contra o limite ("21 de 20 jogadores") no Free; "N jogadores ativos" nos outros;
 * - os recursos, cada um com "Liberado" ou "Só no Pro" em texto e ícone (não só pela cor);
 * - sem a criadora: "Só quem criou o grupo pode assinar ou cancelar", sem botões (PLA-57);
 * - cortesia: nada de assinar nem cancelar (PLA-58).
 * As ações de assinar (T45) e da assinatura atual (T46) entram em `acoesDaCriadora`.
 */

export const TEXTO_SO_A_CRIADORA = 'Só quem criou o grupo pode assinar ou cancelar';

export const NOMES_DOS_PLANOS: Readonly<Record<PlanoResposta['plano'], string>> = {
  free: 'Free',
  trial: 'Trial Pro',
  pro: 'Pro',
  cortesia: 'Cortesia: Pro sem cobrança',
};

export const NOMES_DOS_RECURSOS: Readonly<Record<Recurso, string>> = {
  partidas: 'Partidas',
  ranking: 'Ranking',
  ...NOMES_RECURSOS_PRO,
};

/** "Trial Pro até 14/11/2026", "Pro até 05/12/2026" ou nada. */
export function textoValidade(
  p: Pick<PlanoResposta, 'plano' | 'trialFimEm' | 'pagoAte'>,
): string | null {
  if (p.plano === 'trial' && p.trialFimEm) return `Trial Pro até ${dataBr(p.trialFimEm)}`;
  if (p.plano === 'pro' && p.pagoAte) return `Pro até ${dataBr(p.pagoAte)}`;
  return null;
}

/** "21 de 20 jogadores" com o limite do Free; "12 jogadores ativos" sem limite. */
export function textoJogadoresDoPlano(
  p: Pick<PlanoResposta, 'jogadoresAtivos' | 'limiteJogadores'>,
): string {
  if (p.limiteJogadores !== null) return `${p.jogadoresAtivos} de ${p.limiteJogadores} jogadores`;
  return p.jogadoresAtivos === 1 ? '1 jogador ativo' : `${p.jogadoresAtivos} jogadores ativos`;
}

function IconeRecurso({ liberado }: { liberado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {liberado ? (
        <path d="M20 6 9 17l-5-5" />
      ) : (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      )}
    </svg>
  );
}

export function ResumoDoPlano({ plano }: { plano: PlanoResposta }) {
  const validade = textoValidade(plano);
  const liberados = new Set<string>(plano.recursos);
  return (
    <>
      <section className={modulo.cartao} aria-labelledby="t-plano">
        <h2 id="t-plano" className={estilos.subtitulo}>
          {NOMES_DOS_PLANOS[plano.plano]}
        </h2>
        {validade ? <p>{validade}</p> : null}
        <p>{textoJogadoresDoPlano(plano)}</p>
      </section>
      <h2 className={estilos.subtitulo}>Recursos</h2>
      <Lista rotulo="Recursos do plano">
        {RECURSOS.map((recurso) => {
          const liberado = liberados.has(recurso);
          return (
            <ItemLista
              key={recurso}
              titulo={NOMES_DOS_RECURSOS[recurso]}
              lateral={
                <span>
                  <IconeRecurso liberado={liberado} /> {liberado ? 'Liberado' : 'Só no Pro'}
                </span>
              }
            />
          );
        })}
      </Lista>
    </>
  );
}

export interface PropsMeuPlano {
  /** Ações da criadora (assinar, aguardando, cancelar), postas pelas tarefas T45 e T46. */
  acoesDaCriadora?: (plano: PlanoResposta, grupoId: string) => ReactNode;
}

/**
 * Sem assinatura pendente nem ativa: o formulário de assinar (T45; PLA-53); com ela, a assinatura atual, com o
 * aguardando e o cancelar (T46; PLA-54, PLA-55).
 */
export function acoesPadrao(plano: PlanoResposta, grupoId: string): ReactNode {
  if (plano.assinatura === null || plano.assinatura.situacao === 'cancelada')
    return <AssinarPro grupoId={grupoId} />;
  return <AssinaturaAtual plano={plano} grupoId={grupoId} />;
}

export function MeuPlano({ acoesDaCriadora = acoesPadrao }: PropsMeuPlano = {}) {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const plano = usePlano(grupoId);

  function conteudo() {
    if (plano.isPending) return <EsqueletoLista linhas={4} rotulo="Carregando o plano…" />;
    if (plano.isError) {
      if (plano.error instanceof ErroApi && plano.error.status === 404)
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void plano.refetch()} />;
    }
    const p = plano.data;
    let acoes: ReactNode = null;
    if (p.plano !== 'cortesia') {
      acoes = p.podeAssinar ? acoesDaCriadora(p, grupoId) : <p>{TEXTO_SO_A_CRIADORA}</p>;
    }
    return (
      <>
        <ResumoDoPlano plano={p} />
        {acoes}
      </>
    );
  }

  return (
    <Casca
      grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}
      titulo="Meu plano"
      ocupada={plano.isPending}
    >
      <LinkVoltar para={rotaDoGrupo(grupoId)}>Início</LinkVoltar>
      {conteudo()}
    </Casca>
  );
}
