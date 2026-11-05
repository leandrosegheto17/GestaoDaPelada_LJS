import {
  planoEfetivo,
  planoLibera,
  RECURSOS_POR_PLANO,
  type Data,
  type Plano,
  type RecursoPro,
  type RecursosDoPlano,
} from '@pelada/dominio';
import { plano as repositorioPlano, type DadosDoPlano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import type { Relogio } from '../../infraestrutura/relogio.ts';

/**
 * Ponto único da regra de plano na API (planos-e-cobranca T21; PLA-07, PLA-23, PLA-24, PLA-28; AD-049). Liga o
 * `recursoLiberado` da simulador e da financeiro (`entrada/middlewares/recurso.ts`, S-01: o nome e a assinatura são os
 * da feature dona) ao plano de verdade: `plano.ler` (T20) + `planoEfetivo(…, relogio.hoje())` (T1) +
 * `RECURSOS_POR_PLANO` (T2). Nenhuma outra peça da API decide o plano (PLA-01, checagem da T8).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - cada plano × cada recurso Pro: `free` nega `simulador`, `financeiro`, `pdf` e `push`; `trial`, `pro` e `cortesia`
 *   liberam todos (tabela do domínio, PLA-05);
 * - `trial` vencido (hoje ≥ `trial_inicio` + 14, data de São Paulo do Relógio) → `free` → nega (PLA-07);
 * - `trial_inicio` no futuro → `trial` → libera (PLA-70);
 * - `cancelado` com `pago_ate` ≥ hoje → `pro`; depois → `free` (PLA-04);
 * - grupo que o contexto não enxerga (outra conta, sem contexto, slug de outro grupo) ou inexistente → `false`
 *   (conservador: nunca libera sem ler o plano);
 * - grupo arquivado: a `plano_do_grupo` responde para a criadora e não para a convidada (T12); aqui não se trata à
 *   parte, porque o `exigirGrupoAtivo` já responde 409 antes da trava (AD-077); para quem não enxerga, `false`;
 * - contexto do slug (PDF público, T26): a `plano_do_grupo` responde para o slug do próprio grupo (PLA-25);
 * - recurso desconhecido: erro de tipo (`RecursoPro` do domínio); em tempo de execução, `planoLibera` devolve `false`.
 */

/** O plano do grupo hoje, com os dados que o decidiram e a linha da tabela de recursos (T22 e T24 leem daqui). */
export interface EstadoDoPlano extends DadosDoPlano {
  plano: Plano;
  recursosDoPlano: RecursosDoPlano;
}

/**
 * Lê os dados do plano e decide o plano efetivo de hoje (`AAAA-MM-DD`, São Paulo). `null` quando o grupo não é visível
 * para o contexto da transação.
 */
export async function estadoDoPlano(db: Db, grupoId: string, hoje: Data): Promise<EstadoDoPlano | null> {
  const dados = await repositorioPlano.ler(db, grupoId);
  if (dados === null) return null;
  const plano = planoEfetivo(dados.situacaoComercial, dados.trialInicio, dados.pagoAte, hoje);
  return { ...dados, plano, recursosDoPlano: RECURSOS_POR_PLANO[plano] };
}

/** Assinatura do ponto único (a mesma da simulador, `middlewares/recurso.ts`). */
export type RecursoLiberado = (db: Db, grupoId: string, recurso: RecursoPro) => Promise<boolean>;

/** O ponto único ligado ao plano, com o "hoje" do Relógio da requisição. */
export function recursoLiberadoPeloPlano(relogio: Relogio): RecursoLiberado {
  return async (db, grupoId, recurso) => {
    const estado = await estadoDoPlano(db, grupoId, relogio.hoje());
    if (estado === null) return false;
    return planoLibera(estado.plano, recurso);
  };
}
