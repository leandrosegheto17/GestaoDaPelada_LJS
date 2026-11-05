import type { SemanaDeUso } from '@pelada/contrato/previas';
import { useParams } from 'react-router';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { useUso } from '../../dados/uso.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import tabela from '../tabela-simples.module.css';
import uso from './uso.module.css';

/**
 * Uso do app (`/app/grupos/:grupoId/uso`, t21; partidas-e-ranking T63; PAR-144), de
 * `.specs/mockup/telas/t21-uso--{sucesso,vazio}.html`: a tabela "Uso por semana, mais recente primeiro" com
 * "Semana" ("dd/mm a dd/mm"), "Aparelhos que abriram o ranking", "PDFs exportados", "Partidas lançadas (em até 48 h)"
 * ("N (M)") e "Escalações / partidas" ("E / N"); no celular, a mesma semana em cartões (o CSS mostra um ou outro).
 * Sem semanas: "Ainda não há uso registrado.".
 */

export const TEXTO_SEM_USO = 'Ainda não há uso registrado.';

/** "2026-10-19" → "19/10". */
function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export function textoSemana(s: Pick<SemanaDeUso, 'inicio' | 'fim'>): string {
  return `${diaMes(s.inicio)} a ${diaMes(s.fim)}`;
}

/** "N (M)": partidas lançadas e, entre parênteses, as lançadas em até 48 h. */
export function textoPartidas(s: Pick<SemanaDeUso, 'partidasLancadas' | 'partidasEm48h'>): string {
  return `${s.partidasLancadas} (${s.partidasEm48h})`;
}

/** "E / N": escalações confirmadas sobre partidas lançadas. */
export function textoEscalacoes(s: Pick<SemanaDeUso, 'escalacoesConfirmadas' | 'partidasLancadas'>): string {
  return `${s.escalacoesConfirmadas} / ${s.partidasLancadas}`;
}

function Semanas({ semanas }: { semanas: readonly SemanaDeUso[] }) {
  if (semanas.length === 0) {
    return (
      <div className={estilos.vazio}>
        <h2 className={estilos['vazio__titulo']}>{TEXTO_SEM_USO}</h2>
      </div>
    );
  }
  return (
    <>
      <table className={`${tabela['tabela-simples']} ${uso.tabela}`}>
        <caption className="sr">Uso por semana, mais recente primeiro</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Aparelhos que abriram o ranking</th>
            <th scope="col">PDFs exportados</th>
            <th scope="col">Partidas lançadas (em até 48 h)</th>
            <th scope="col">Escalações / partidas</th>
          </tr>
        </thead>
        <tbody>
          {semanas.map((s) => (
            <tr key={s.inicio}>
              <th scope="row">{textoSemana(s)}</th>
              <td>{s.aparelhosRanking}</td>
              <td>{s.pdfsExportados}</td>
              <td>{textoPartidas(s)}</td>
              <td>{textoEscalacoes(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={uso['cartoes-semana']}>
        {semanas.map((s, i) => (
          <section key={s.inicio} className={modulo.cartao} aria-labelledby={`semana-${i}`}>
            <h2 id={`semana-${i}`} className={uso.semana}>
              {textoSemana(s)}
            </h2>
            <dl className={uso.indicadores}>
              <dt>Aparelhos</dt>
              <dd>{s.aparelhosRanking}</dd>
              <dt>PDFs</dt>
              <dd>{s.pdfsExportados}</dd>
              <dt>Partidas (em até 48 h)</dt>
              <dd>{textoPartidas(s)}</dd>
              <dt>Escalações / partidas</dt>
              <dd>{textoEscalacoes(s)}</dd>
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}

export function PaginaUso() {
  const { grupoId = '' } = useParams();
  const base = rotaDoGrupo(grupoId);
  const grupo = useGrupo(grupoId);
  const consulta = useUso(grupoId);

  function conteudo() {
    if (consulta.isPending) return <EsqueletoLista linhas={4} rotulo="Carregando o uso do app…" />;
    if (consulta.isError) {
      if (consulta.error instanceof ErroApi && consulta.error.status === 404) return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    return <Semanas semanas={consulta.data.semanas} />;
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} titulo="Uso do app">
      <LinkVoltar para={base}>Início</LinkVoltar>
      {conteudo()}
    </Casca>
  );
}
