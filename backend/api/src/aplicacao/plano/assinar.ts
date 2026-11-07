import { planoEfetivo, PRECO_PRO_CENTAVOS, type Data } from '@pelada/dominio';
import type { Asaas, RegistroAsaas } from '../../infraestrutura/asaas/cliente.ts';
import { assinaturas } from '../../infraestrutura/db/repositorios/assinaturas.ts';
import { contas } from '../../infraestrutura/db/repositorios/contas.ts';
import { grupos } from '../../infraestrutura/db/repositorios/grupos.ts';
import { plano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * Assinar o Pro (planos-e-cobranca T32; PLA-29, PLA-33, PLA-35, PLA-36; S:47-49; AD-096, AD-097, AD-114). Roda na
 * transação da requisição: trava o grupo, confere quem assina e a assinatura vigente antes de falar com o Asaas, cria
 * (ou reaproveita) o cliente, cria a assinatura com a primeira cobrança vencendo hoje, lê a fatura e só então grava.
 *
 * Casos limite e estados (Domínio: sim), listados antes do código:
 * - quem não é a criadora (admin convidada): `so_quem_criou`, sem chamar o Asaas (PLA-32);
 * - grupo de cortesia (`uso_proprio`): `grupo_cortesia`, sem chamar o Asaas (A-04, PLA-02);
 * - 5 assinaturas abertas pelo grupo, ou 10 pela conta somando os grupos dela, na última hora (assinar e cancelar em
 *   ciclo): `muitas_tentativas`, sem chamar o Asaas (A-08, A-17, SEC-002, SEC-007); tentativas que falham no Asaas não
 *   gravam linha e não contam (risco aceito, AD-141);
 * - já há assinatura `aguardando_pagamento`: `assinatura_pendente` com a fatura dela, sem chamar o Asaas (PLA-33);
 * - já há assinatura `ativa`: `assinatura_ativa` com a fatura (se houver), sem chamar o Asaas (PLA-33);
 * - duas requisições simultâneas do mesmo grupo: a trava (AD-097) faz a segunda esperar e ver a pendente da primeira;
 * - cliente já existente da conta (outro grupo, ou assinatura cancelada deste): reaproveitado, sem `criarCliente`
 *   (AD-096); o CPF só vai ao Asaas quando o cliente é criado;
 * - falha em `criarCliente` ou `criarAssinatura` (erro, 429, 10 s): `pagamento_indisponivel`, nada gravado, nenhuma
 *   segunda tentativa (PLA-36);
 * - falha em `primeiraCobranca` com a assinatura já criada no Asaas: `removerAssinatura` uma vez (compensação, não
 *   repetição) e `pagamento_indisponivel` sem gravar (AD-114); se a remoção também falha, o log leva o id da
 *   assinatura para a limpeza manual, nunca o CPF;
 * - erro inesperado (lança) depois de a assinatura existir no Asaas: a mesma compensação e o erro sobe (A-06); a falha
 *   do COMMIT depois do retorno fica fora do alcance desta função;
 * - a gravação recusa depois de a assinatura existir no Asaas (corrida rara, grupo arquivado): a mesma compensação;
 * - plano atual `trial`, Free, `inadimplente` ou `cancelado`: todos podem assinar; assinar não muda o plano (PLA-31,
 *   o webhook de pagamento é que ativa);
 * - o CPF não é gravado em nenhuma tabela nem na auditoria (PLA-35): só passa ao `criarCliente`.
 */

/** Teto de assinaturas abertas por grupo em 1 hora (A-08): assinar e cancelar em ciclo gastaria a cota do Asaas. */
export const TETO_ASSINATURAS_POR_HORA = 5;

/** Teto por conta, somando todos os grupos dela (A-17): com muitos grupos, o teto por grupo sozinho não segura o ciclo. */
export const TETO_ASSINATURAS_POR_HORA_CONTA = 10;

export interface PedidoAssinar {
  grupoId: string;
  conta: string;
  nome: string;
  /** Só dígitos, já validado pelo contrato (`cpf`, T6). */
  cpf: string;
  hoje: Data;
}

export type ResultadoAssinar =
  | { resultado: 'criada'; faturaUrl: string }
  | { resultado: 'assinatura_pendente'; faturaUrl: string | null }
  | { resultado: 'assinatura_ativa'; faturaUrl: string | null }
  | { resultado: 'so_quem_criou' }
  | { resultado: 'grupo_cortesia' }
  | { resultado: 'muitas_tentativas' }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'pagamento_indisponivel' };

const registroPadrao: RegistroAsaas = (linha) => console.error(JSON.stringify(linha));

export interface OpcoesAssinar {
  registrar?: RegistroAsaas;
}

/** Descrição da assinatura no Asaas: o produto e o nome do grupo (PLA-29). */
export function descricaoDaAssinatura(nomeDoGrupo: string): string {
  return `Gestão da Pelada Pro: ${nomeDoGrupo}`;
}

export async function assinar(
  db: Db,
  asaas: Asaas,
  pedido: PedidoAssinar,
  opcoes: OpcoesAssinar = {},
): Promise<ResultadoAssinar> {
  const registrar = opcoes.registrar ?? registroPadrao;
  const { grupoId, conta, nome, cpf, hoje } = pedido;

  await assinaturas.travarGrupo(db, grupoId);

  const dados = await plano.ler(db, grupoId);
  if (dados === null) return { resultado: 'nao_encontrado' };
  if (dados.criadoPor !== conta) return { resultado: 'so_quem_criou' };
  // A-04: a cortesia (`uso_proprio`) já tem o Pro; cobrar não faz sentido e `plano_ativar` a manteria (PLA-02, PLA-58).
  if (
    planoEfetivo(dados.situacaoComercial, dados.trialInicio, dados.pagoAte, hoje) === 'cortesia'
  ) {
    return { resultado: 'grupo_cortesia' };
  }

  const vigente = await assinaturas.pendenteOuAtiva(db, grupoId);
  if (vigente !== null) {
    return vigente.situacao === 'aguardando_pagamento'
      ? { resultado: 'assinatura_pendente', faturaUrl: vigente.faturaUrl }
      : { resultado: 'assinatura_ativa', faturaUrl: vigente.faturaUrl };
  }

  if (
    (await assinaturas.abertasNaUltimaHora(db, grupoId)) >= TETO_ASSINATURAS_POR_HORA ||
    (await assinaturas.abertasPelaContaNaUltimaHora(db, conta)) >= TETO_ASSINATURAS_POR_HORA_CONTA
  ) {
    return { resultado: 'muitas_tentativas' };
  }

  const grupo = await grupos.ler(db, grupoId);
  if (!grupo) return { resultado: 'nao_encontrado' };

  let clienteId = await assinaturas.clienteDaConta(db, conta);
  if (clienteId === null) {
    const eu = await contas.eu(db);
    if (eu === null) return { resultado: 'so_quem_criou' };
    const cliente = await asaas.criarCliente({
      name: nome,
      cpfCnpj: cpf,
      email: eu.email,
      externalReference: conta,
    });
    if (cliente === 'falhou') return { resultado: 'pagamento_indisponivel' };
    clienteId = cliente.id;
  }

  const criada = await asaas.criarAssinatura({
    customer: clienteId,
    valorCentavos: PRECO_PRO_CENTAVOS,
    nextDueDate: hoje,
    description: descricaoDaAssinatura(grupo.nome),
    externalReference: grupoId,
  });
  if (criada === 'falhou') return { resultado: 'pagamento_indisponivel' };

  const compensar = async (motivo: string): Promise<ResultadoAssinar> => {
    const removida = await asaas.removerAssinatura(criada.id);
    if (removida === 'falhou') {
      registrar({ evento: 'asaas_compensacao_falhou', motivo, assinaturaId: criada.id, grupoId });
    }
    return { resultado: 'pagamento_indisponivel' };
  };

  // A-06: erro inesperado (a leitura da fatura ou a gravação lançam) depois de a assinatura existir no Asaas: remove-a
  // antes de subir o erro, senão a cliente seria cobrada sem Pro e o webhook ignoraria a assinatura sem linha local.
  try {
    const cobranca = await asaas.primeiraCobranca(criada.id);
    if (cobranca === 'falhou') return await compensar('primeira_cobranca');

    const gravada = await assinaturas.registrar(db, grupoId, {
      clienteId,
      assinaturaId: criada.id,
      valorCentavos: PRECO_PRO_CENTAVOS,
      faturaUrl: cobranca.invoiceUrl,
    });
    if (gravada.resultado !== 'ok') return await compensar(`registrar_${gravada.resultado}`);
    return { resultado: 'criada', faturaUrl: cobranca.invoiceUrl };
  } catch (erro) {
    await compensar('erro_inesperado').catch(() => undefined);
    throw erro;
  }
}
