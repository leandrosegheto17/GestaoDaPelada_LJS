// SPEC_DEVIATION: no legado este trecho vive em `enums.ts` (zod). Aqui entra só a lista de dias,
// sem zod, porque o front base (formatação de datas) precisa dela; o resto do contrato chega com as features.
export const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export type DiaSemana = (typeof DIAS_DA_SEMANA)[number];
