import { z } from 'zod';

/**
 * Contrato da configuração e do mês do caixa (T7; FIN-01, FIN-03, FIN-07, FIN-08, FIN-13, FIN-14). Todo valor em
 * centavos inteiros: o zod recusa decimal, texto, NaN e infinito. O teto (99.999.999) vale só para a entrada do
 * cliente; saldo e somas da resposta aceitam qualquer inteiro seguro (FIN-13). A data do saldo inicial no futuro
 * depende de "hoje" e é recusada pela rota (FIN-02, T25), não aqui.
 */

export const LIMITES_FINANCEIRO = {
  valorMin: 1,
  valorMax: 99_999_999,
  saldoInicialMin: -99_999_999,
  saldoInicialMax: 99_999_999,
} as const;

export const MENSAGEM_MES_INVALIDO = 'Mês inválido.';
// Mesmo texto do `MENSAGEM_DATA_INVALIDA` da grupos-e-elenco (`elenco.ts`); fica local para este contrato não
// depender da feature 3 na passada de rascunho. O /executar pode unificar.
const MENSAGEM_DATA_INVALIDA = 'Informe uma data válida.';
const MENSAGEM_VALOR = 'Informe um valor inteiro em centavos dentro do limite.';

/** Inteiro seguro na faixa, em centavos. */
const centavos = (min: number, max: number) =>
  z
    .number({ error: MENSAGEM_VALOR })
    .int(MENSAGEM_VALOR)
    .min(min, MENSAGEM_VALOR)
    .max(max, MENSAGEM_VALOR)
    .refine(Number.isSafeInteger, MENSAGEM_VALOR);

/** Saldo e somas de resposta: qualquer inteiro seguro (a soma pode passar do teto de entrada). */
const saldoResposta = centavos(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
const somaResposta = centavos(0, Number.MAX_SAFE_INTEGER);

/** Data real `AAAA-MM-DD` (o `z.iso.date()` confere o calendário, inclusive o 29/02 de ano bissexto). */
export const dataFinanceira = z.iso.date({ error: MENSAGEM_DATA_INVALIDA });

/** Mês `AAAA-MM`, de 01 a 12. */
export const mesFinanceiro = z
  .string({ error: MENSAGEM_MES_INVALIDO })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, MENSAGEM_MES_INVALIDO);

/** `PUT .../financeiro/config`: mensalidade obrigatória no corpo (nulo explícito = sem mensalidade). */
export const configFinanceiraCorpo = z
  .object({
    mensalidadeCentavos: centavos(LIMITES_FINANCEIRO.valorMin, LIMITES_FINANCEIRO.valorMax).nullable(),
    saldoInicialCentavos: centavos(LIMITES_FINANCEIRO.saldoInicialMin, LIMITES_FINANCEIRO.saldoInicialMax),
    dataSaldoInicial: dataFinanceira,
  })
  .strict();
export type ConfigFinanceiraCorpo = z.infer<typeof configFinanceiraCorpo>;

/** Resposta da configuração: os três campos gravados. */
export const configFinanceiraResposta = z
  .object({
    mensalidadeCentavos: saldoResposta.nullable(),
    saldoInicialCentavos: saldoResposta,
    dataSaldoInicial: dataFinanceira,
  })
  .strict();
export type ConfigFinanceiraResposta = z.infer<typeof configFinanceiraResposta>;

/** `GET .../financeiro/mes?mes=AAAA-MM`; sem `mes`, a rota usa o mês de hoje. */
export const mesFinanceiroConsulta = z.object({ mes: mesFinanceiro.optional() }).strict();
export type MesFinanceiroConsulta = z.infer<typeof mesFinanceiroConsulta>;

export const tipoLancamento = z.enum(['entrada', 'saida']);
export type TipoLancamento = z.infer<typeof tipoLancamento>;

/** Pagamento na lista do mês: só jogadores ativos no mês (FIN-12). */
export const pagamentoDoMes = z.object({ jogadorId: z.uuid(), apelido: z.string(), pagou: z.boolean() }).strict();

/** Lançamento na lista do mês; `mensalidade` marca o vinculado a um pagamento (FIN-14). */
export const lancamentoDoMes = z
  .object({
    id: z.uuid(),
    tipo: tipoLancamento,
    data: dataFinanceira,
    descricao: z.string(),
    valorCentavos: saldoResposta,
    mensalidade: z.boolean(),
  })
  .strict();
export type LancamentoDoMes = z.infer<typeof lancamentoDoMes>;

export const resumoDoMes = z
  .object({
    entradasCentavos: somaResposta,
    saidasCentavos: somaResposta,
    resultadoCentavos: saldoResposta,
    naoPagaram: z.number().int().min(0),
  })
  .strict();

/** Resposta do mês (FIN-07); sem configuração, configuração, saldo e resumo nulos juntos (FIN-08). */
export const mesFinanceiroResposta = z
  .object({
    mes: mesFinanceiro,
    hoje: dataFinanceira,
    navegacao: z.object({ mesAnterior: mesFinanceiro.nullable(), mesSeguinte: mesFinanceiro.nullable() }).strict(),
    config: configFinanceiraResposta.nullable(),
    saldoAtualCentavos: saldoResposta.nullable(),
    resumoMes: resumoDoMes.nullable(),
    pagamentos: z.array(pagamentoDoMes),
    lancamentos: z.array(lancamentoDoMes),
  })
  .strict()
  .superRefine((m, contexto) => {
    const semConfig = m.config === null;
    if (semConfig !== (m.saldoAtualCentavos === null) || semConfig !== (m.resumoMes === null)) {
      contexto.addIssue({
        code: 'custom',
        path: ['config'],
        message: 'Sem configuração do caixa, não há saldo nem resumo.',
      });
    }
  });
export type MesFinanceiroResposta = z.infer<typeof mesFinanceiroResposta>;
