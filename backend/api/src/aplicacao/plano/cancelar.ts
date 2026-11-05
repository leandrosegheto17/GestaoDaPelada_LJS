import type { Asaas, RegistroAsaas } from '../../infraestrutura/asaas/cliente.ts';
import { assinaturas } from '../../infraestrutura/db/repositorios/assinaturas.ts';
import { plano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * Cancelar a assinatura (planos-e-cobranca T34; PLA-55, PLA-56; S:205-206; AD-097, AD-115). Roda na transação da
 * requisição: trava o grupo (a mesma trava do assinar), confere a criadora e a assinatura vigente antes de falar com o
 * Asaas, remove a assinatura no Asaas e só com sucesso grava pela `assinatura_cancelar` (T14).
 *
 * Casos limite e estados (Domínio: sim), listados antes do código:
 * - quem não é a criadora (admin convidada): `so_quem_criou`, sem chamar o Asaas;
 * - sem assinatura `ativa` nem `aguardando_pagamento`: `sem_assinatura` (409), sem chamar o Asaas;
 * - assinatura `ativa`: remove no Asaas; grupo `cancelado`, `pago_ate` mantido na assinatura; o plano segue `pro` até
 *   ele (PLA-04, PLA-55);
 * - assinatura `aguardando_pagamento` (AD-115): remove no Asaas; a assinatura vira `cancelada` e o grupo não muda; um
 *   novo assinar é aceito (o índice `assinaturas_uma_vigente` já não a conta);
 * - falha no Asaas (erro, 429, 10 s): `pagamento_indisponivel` (502), nada gravado, grupo segue `ativo`, sem
 *   auditoria `plano_cancelado` e sem segunda tentativa (PLA-56);
 * - `SUBSCRIPTION_DELETED` chegando antes da resposta: o webhook não usa a trava do grupo; se ele grava primeiro, a
 *   `assinatura_cancelar` não acha vigente (P0002) e a resposta segue `cancelada` (204), porque o Asaas já removeu e o
 *   estado final é o mesmo; se a requisição grava primeiro, o `plano_cancelado` do webhook acha `cancelada` e não faz
 *   nada (T16);
 * - a `assinatura_cancelar` recusa a conta (42501) depois da remoção no Asaas (corrida rara: a criadora deixou de
 *   sê-lo): o Asaas já removeu e não há como desfazer; vai ao log com os ids, e a resposta é `so_quem_criou`. O
 *   webhook `SUBSCRIPTION_DELETED` que vem depois leva o grupo ao estado certo.
 */

export interface PedidoCancelar {
  grupoId: string;
  conta: string;
}

export type ResultadoCancelar =
  | { resultado: 'cancelada' }
  | { resultado: 'sem_assinatura' }
  | { resultado: 'so_quem_criou' }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'pagamento_indisponivel' };

const registroPadrao: RegistroAsaas = (linha) => console.error(JSON.stringify(linha));

export interface OpcoesCancelar {
  registrar?: RegistroAsaas;
}

export async function cancelar(
  db: Db,
  asaas: Asaas,
  pedido: PedidoCancelar,
  opcoes: OpcoesCancelar = {},
): Promise<ResultadoCancelar> {
  const registrar = opcoes.registrar ?? registroPadrao;
  const { grupoId, conta } = pedido;

  await assinaturas.travarGrupo(db, grupoId);

  const dados = await plano.ler(db, grupoId);
  if (dados === null) return { resultado: 'nao_encontrado' };
  if (dados.criadoPor !== conta) return { resultado: 'so_quem_criou' };

  const vigente = await assinaturas.pendenteOuAtiva(db, grupoId);
  if (vigente === null) return { resultado: 'sem_assinatura' };

  const removida = await asaas.removerAssinatura(vigente.asaasAssinaturaId);
  if (removida === 'falhou') return { resultado: 'pagamento_indisponivel' };

  const gravada = await assinaturas.cancelar(db, grupoId);
  switch (gravada.resultado) {
    case 'ok':
    case 'sem_assinatura':
      // `sem_assinatura` depois da remoção: o webhook `SUBSCRIPTION_DELETED` gravou antes; o estado final é o mesmo.
      return { resultado: 'cancelada' };
    case 'so_quem_criou':
      registrar({
        evento: 'asaas_cancelada_sem_gravar',
        assinaturaId: vigente.asaasAssinaturaId,
        grupoId,
      });
      return { resultado: 'so_quem_criou' };
  }
}
