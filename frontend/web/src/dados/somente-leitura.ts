import type { PlanoResposta } from '@pelada/contrato/plano';
import { usePlano } from './plano.ts';

/**
 * Somente leitura do grupo no front (planos-e-cobranca T43; PLA-22): o motivo vem do `GET …/plano` (`somenteLeitura`),
 * nunca calculado aqui (a regra é da API, PLA-07). Enquanto o plano carrega ou falha, o grupo é tratado como editável:
 * a API recusa a escrita com 403 de qualquer jeito (PLA-21), e o 403 relê o plano (T41).
 *
 * SPEC_DEVIATION: a tarefa pede um provedor `PlanoDoGrupo` no layout das rotas `/app/grupos/:grupoId/*`; as rotas do
 * app são planas (`app/rotas.tsx`, sem layout de grupo), então cada tela lê o plano pelo hook, e o cache do TanStack
 * Query divide a mesma consulta entre a faixa e os botões.
 */

export type MotivoSomenteLeitura = NonNullable<PlanoResposta['somenteLeitura']>['motivo'];

export function useSomenteLeitura(grupoId: string): MotivoSomenteLeitura | null {
  const plano = usePlano(grupoId);
  return plano.data?.somenteLeitura?.motivo ?? null;
}
