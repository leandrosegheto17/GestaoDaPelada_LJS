import { z } from 'zod';
import { textoVisivel } from './grupo.ts';

/**
 * Contrato do plano e da assinatura (T6; PLA-08, PLA-30, PLA-33, PLA-35, PLA-36, AD-091). Resposta de
 * `GET /api/grupos/:grupoId/plano`, corpo e resposta de `POST /api/grupos/:grupoId/assinatura` e os corpos de erro.
 *
 * Os erros desta feature seguem a forma da AD-091 (`{"erro":"plano_pro","recurso":…}`), em que `erro` é o código, e não
 * a de `corpoErro` (`acesso.ts`, em que `erro` é a mensagem e `codigo` o código): a AD manda e a tela e o teste
 * reconhecem o código pelo campo `erro`. A mensagem visível vai junto em `mensagem`.
 */

/** Os planos efetivos e as situações, iguais aos do domínio (`backend/dominio/src/plano/`). */
export const PLANOS_CONTRATO = ['cortesia', 'trial', 'pro', 'free'] as const;
export const SITUACOES_CONTRATO = [
  'uso_proprio',
  'trial',
  'ativo',
  'inadimplente',
  'cancelado',
] as const;
export const RECURSOS_CONTRATO = [
  'partidas',
  'ranking',
  'simulador',
  'financeiro',
  'pdf',
  'push',
] as const;
export const RECURSOS_PRO_CONTRATO = ['simulador', 'financeiro', 'pdf', 'push'] as const;
export const MOTIVOS_SOMENTE_LEITURA = ['limite_jogadores', 'limite_grupos'] as const;
export const SITUACOES_ASSINATURA_CONTRATO = [
  'aguardando_pagamento',
  'ativa',
  'cancelada',
] as const;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contagem = z.number().int().min(0);

/**
 * `GET /api/grupos/:grupoId/plano` (PLA-08). `trialFimEm` só em trial; `pagoAte` quando houver; `somenteLeitura` nulo
 * quando o grupo é editável.
 *
 * SPEC_DEVIATION: `assinatura` (situação e link da fatura em aberto) não está na lista de PLA-08, mas Meu plano precisa
 * dela para PLA-53, PLA-54 e PLA-55 (formulário, "Aguardando…" com o link e o botão de cancelar) sem outra chamada.
 */
export const planoResposta = z
  .object({
    plano: z.enum(PLANOS_CONTRATO),
    situacao: z.enum(SITUACOES_CONTRATO),
    trialFimEm: data.nullable(),
    pagoAte: data.nullable(),
    jogadoresAtivos: contagem,
    limiteJogadores: z.literal(20).nullable(),
    somenteLeitura: z
      .object({ motivo: z.enum(MOTIVOS_SOMENTE_LEITURA) })
      .strict()
      .nullable(),
    recursos: z.array(z.enum(RECURSOS_CONTRATO)),
    podeAssinar: z.boolean(),
    assinatura: z
      .object({ situacao: z.enum(SITUACOES_ASSINATURA_CONTRATO), faturaUrl: z.string().nullable() })
      .strict()
      .nullable(),
  })
  .strict();
export type PlanoResposta = z.infer<typeof planoResposta>;

export const LIMITES_ASSINATURA = { nomeMin: 3, nomeMax: 100 } as const;
export const MENSAGEM_NOME_PAGADOR = `Informe o nome completo, de ${LIMITES_ASSINATURA.nomeMin} a ${LIMITES_ASSINATURA.nomeMax} caracteres.`;
export const MENSAGEM_CPF = 'CPF inválido.';

/** Só dígitos; a máscara `000.000.000-00` é aceita e removida. */
function soDigitosDoCpf(valor: string): string | null {
  const limpo = valor.trim();
  if (!/^(\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/.test(limpo)) return null;
  return limpo.replace(/\D/g, '');
}

/** Dígitos verificadores do CPF (módulo 11). Sequência de um dígito só (`111.111.111-11`) é inválida. */
export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const n = digitos.split('').map(Number);
  const dv = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += (n[i] as number) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === n[9] && dv(10) === n[10];
}

/** CPF do pagador (PLA-35): validado aqui, enviado ao Asaas e nunca gravado. Sai só com os 11 dígitos. */
export const cpf = z.string({ error: MENSAGEM_CPF }).transform((valor, ctx) => {
  const digitos = soDigitosDoCpf(valor);
  if (digitos === null || !cpfValido(digitos)) {
    ctx.addIssue({ code: 'custom', message: MENSAGEM_CPF });
    return z.NEVER;
  }
  return digitos;
});

/** `POST /api/grupos/:grupoId/assinatura`. Sem campo de cartão: campo a mais é recusado (PLA-34). */
export const assinaturaCorpo = z
  .object({
    nome: textoVisivel(
      LIMITES_ASSINATURA.nomeMin,
      LIMITES_ASSINATURA.nomeMax,
      MENSAGEM_NOME_PAGADOR,
    ),
    cpf,
  })
  .strict();
export type AssinaturaCorpo = z.infer<typeof assinaturaCorpo>;

/** 201 de `POST …/assinatura` (PLA-30): o endereço da fatura da primeira cobrança. */
export const assinaturaCriada = z.object({ faturaUrl: z.string().min(1) }).strict();
export type AssinaturaCriada = z.infer<typeof assinaturaCriada>;

export const MENSAGEM_PAGAMENTO_INDISPONIVEL =
  'Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.';

/** 403 de recurso Pro no Free (PLA-23 a PLA-25, AD-091). */
export const erroPlanoPro = z
  .object({
    erro: z.literal('plano_pro'),
    recurso: z.enum(RECURSOS_PRO_CONTRATO),
    mensagem: z.string().optional(),
  })
  .strict();

/** 403 de escrita no excedente do Free (PLA-15 a PLA-17). */
export const erroSomenteLeitura = z
  .object({
    erro: z.literal('somente_leitura'),
    motivo: z.enum(MOTIVOS_SOMENTE_LEITURA),
    mensagem: z.string().optional(),
  })
  .strict();

/** 409 de assinar com assinatura já pendente (PLA-33): devolve a fatura em aberto. */
export const erroAssinaturaPendente = z
  .object({
    erro: z.literal('assinatura_pendente'),
    faturaUrl: z.string().nullable(),
    mensagem: z.string().optional(),
  })
  .strict();

/** 409 de assinar com assinatura já ativa (PLA-33). */
export const erroAssinaturaAtiva = z
  .object({
    erro: z.literal('assinatura_ativa'),
    faturaUrl: z.string().nullable().optional(),
    mensagem: z.string().optional(),
  })
  .strict();

/** 409 `assinatura_ativa` de arquivar o grupo com assinatura pendente ou ativa (PLA-69, AD-115, T38). */
export const MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR = 'Cancele a assinatura antes de arquivar o grupo';

/** 409 `assinatura_ativa` de excluir a conta criadora de grupo com assinatura pendente ou ativa (PLA-68, T38). */
export function mensagemCanceleAntesDeExcluir(nomeDoGrupo: string): string {
  return `Cancele a assinatura do grupo ${nomeDoGrupo} antes de excluir a conta`;
}

/** 409 de cancelar sem assinatura ativa nem pendente (PLA-55, T34). */
export const erroSemAssinatura = z
  .object({
    erro: z.literal('sem_assinatura'),
    mensagem: z.string().optional(),
  })
  .strict();

/** 502 quando o Asaas falha, demora ou responde 429 (PLA-36, PLA-56). */
export const erroPagamentoIndisponivel = z
  .object({
    erro: z.literal('pagamento_indisponivel'),
    mensagem: z.literal(MENSAGEM_PAGAMENTO_INDISPONIVEL),
  })
  .strict();

export const CODIGOS_ERRO_PLANO = [
  'plano_pro',
  'somente_leitura',
  'assinatura_pendente',
  'assinatura_ativa',
  'sem_assinatura',
  'pagamento_indisponivel',
] as const;
export type CodigoErroPlano = (typeof CODIGOS_ERRO_PLANO)[number];

export const MENSAGENS_ERRO_PLANO: Readonly<Record<CodigoErroPlano, string>> = {
  plano_pro: 'Este recurso é do plano Pro.',
  somente_leitura: 'O grupo está somente leitura no plano Free.',
  assinatura_pendente: 'Já há uma assinatura aguardando o pagamento.',
  assinatura_ativa: 'O grupo já tem uma assinatura ativa.',
  sem_assinatura: 'O grupo não tem assinatura para cancelar.',
  pagamento_indisponivel: MENSAGEM_PAGAMENTO_INDISPONIVEL,
};
