import { z } from 'zod';
import { centavos, dataFinanceira, idResposta, LIMITES_FINANCEIRO, mesFinanceiro, tipoLancamento } from './financeiro.ts';

/**
 * Contrato de pagamentos, lançamentos e acesso do financeiro (T8; FIN-25, FIN-26, FIN-35, FIN-36). Corpos `.strict()`:
 * qualquer campo de vínculo com mensalidade (`pagamentoId`, `mensalidade`, `lancamentoId`) é campo extra e dá 422
 * (FIN-26). O valor da mensalidade nunca vem do cliente (FIN-16).
 */

export const LIMITES_LANCAMENTO = { descricaoMin: 1, descricaoMax: 80 } as const;

export const MENSAGEM_DESCRICAO = `A descrição precisa ter de ${LIMITES_LANCAMENTO.descricaoMin} a ${LIMITES_LANCAMENTO.descricaoMax} caracteres.`;
export const MENSAGEM_TIPO = 'Escolha entrada ou saída.';
export const MENSAGEM_JOGADOR_FORA_DO_MES = 'O jogador precisa estar ativo no grupo nesse mês.';
export const MENSAGEM_MENSALIDADE_ENTRADA = 'A mensalidade é sempre uma entrada.';

/** `POST .../financeiro/pagamentos`. O jogador de outro grupo ou inexistente é recusado pela rota com 422 (FIN-19). */
export const pagamentoCorpo = z
  .object({
    jogadorId: z.uuid({ error: MENSAGEM_JOGADOR_FORA_DO_MES }),
    mes: mesFinanceiro,
  })
  .strict();
export type PagamentoCorpo = z.infer<typeof pagamentoCorpo>;

/** Descrição de 1 a 80 caracteres depois de tirar os espaços das pontas; sai sem eles (FIN-25, FIN-26). */
export const descricaoLancamento = z
  .string({ error: MENSAGEM_DESCRICAO })
  .trim()
  .min(LIMITES_LANCAMENTO.descricaoMin, MENSAGEM_DESCRICAO)
  .max(LIMITES_LANCAMENTO.descricaoMax, MENSAGEM_DESCRICAO);

/** `POST` e `PUT .../financeiro/lancamentos[/:id]`. */
export const lancamentoCorpo = z
  .object({
    tipo: z.enum(tipoLancamento.options, { error: MENSAGEM_TIPO }),
    data: dataFinanceira,
    descricao: descricaoLancamento,
    valorCentavos: centavos(LIMITES_FINANCEIRO.valorMin, LIMITES_FINANCEIRO.valorMax),
  })
  .strict();
export type LancamentoCorpo = z.infer<typeof lancamentoCorpo>;

/** Lançamento devolvido por `GET`, `POST` e `PUT`; `alteradoPor` é o nome, ou "Conta excluída" (FIN-32, ACE-28). */
export const lancamentoResposta = z
  .object({
    id: idResposta,
    tipo: tipoLancamento,
    data: dataFinanceira,
    descricao: z.string(),
    valorCentavos: centavos(LIMITES_FINANCEIRO.valorMin, LIMITES_FINANCEIRO.valorMax),
    mensalidade: z.boolean(),
    alteradoPor: z.string(),
    alteradoEm: z.iso.datetime({ offset: true }),
  })
  .strict();
export type LancamentoResposta = z.infer<typeof lancamentoResposta>;

/** `PATCH .../admins/:contaId/financeiro` (FIN-35). */
export const acessoFinanceiroCorpo = z.object({ acessaFinanceiro: z.boolean() }).strict();
export type AcessoFinanceiroCorpo = z.infer<typeof acessoFinanceiroCorpo>;

/**
 * Códigos de erro do financeiro, com as mensagens da spec. `plano_pro` repete o código e o texto de
 * `CODIGOS_ERRO_PLANO` (`plano.ts`, feature 7) para o financeiro não depender da feature seguinte; o /executar pode
 * unificar. `jogador_fora_do_mes` é o motivo interno do 422 no campo `jogadorId` (FIN-19).
 */
export const CODIGOS_ERRO_FINANCEIRO = [
  'pagamento_ja_marcado',
  'lancamento_vinculado',
  'sem_permissao_financeiro',
  'acao_na_propria_conta',
  'plano_pro',
] as const;
export type CodigoErroFinanceiro = (typeof CODIGOS_ERRO_FINANCEIRO)[number];

export const MENSAGENS_ERRO_FINANCEIRO: Readonly<Record<Exclude<CodigoErroFinanceiro, 'lancamento_vinculado'>, string>> = {
  pagamento_ja_marcado: 'O pagamento deste mês já está marcado.',
  sem_permissao_financeiro: 'Você não tem acesso ao financeiro deste grupo.',
  acao_na_propria_conta: 'Você não pode alterar a sua própria permissão.',
  plano_pro: 'Este recurso é do plano Pro.',
};

/** Mensagem do 409 `lancamento_vinculado` (FIN-30); `mes` em `AAAA-MM` vira `MM/AAAA`. */
export function mensagemLancamentoVinculado(apelido: string, mes: string): string {
  const [ano, numeroMes] = mes.split('-');
  return `Esta entrada é a mensalidade de ${apelido} ${numeroMes}/${ano}. Desmarque o pagamento no mês para removê-la.`;
}
