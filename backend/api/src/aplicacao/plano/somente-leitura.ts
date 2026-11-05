import {
  planoEfetivo,
  somenteLeitura,
  type Data,
  type MotivoSomenteLeitura,
  type OperacaoDeEscrita,
} from '@pelada/dominio';
import { plano as repositorioPlano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import type { EstadoDoPlano } from './recurso-liberado.ts';

/**
 * Motivo de somente leitura do grupo (planos-e-cobranca T22 e T24; PLA-15, PLA-17; AD-092): o `exigirPlanoEditavel`
 * (T22) o usa nas escritas e o `GET …/plano` (T24) o mostra. Fora do Free, `null` sem ler a lista da criadora. No Free,
 * cada grupo da criadora passa pelo `planoEfetivo` (só os Free contam para o limite de grupos) e o domínio decide.
 */
export async function motivoSomenteLeitura(
  db: Db,
  grupoId: string,
  hoje: Data,
  estado: EstadoDoPlano,
  operacao: OperacaoDeEscrita,
): Promise<MotivoSomenteLeitura | null> {
  if (estado.plano !== 'free') return null;
  const daCriadora = await repositorioPlano.gruposDaCriadora(db, grupoId);
  const gruposFreeDaCriadora = daCriadora
    .filter((g) => planoEfetivo(g.situacaoComercial, g.trialInicio, g.pagoAte, hoje) === 'free')
    .map((g) => ({ id: g.id, criadoEm: g.criadoEm }));
  return somenteLeitura({
    plano: estado.plano,
    jogadoresAtivos: estado.jogadoresAtivos,
    gruposFreeDaCriadora,
    grupoId,
    operacao,
  });
}
