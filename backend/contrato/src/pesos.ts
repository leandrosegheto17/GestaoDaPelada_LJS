import { z } from 'zod';

/**
 * Contrato dos pesos de pontuação (T17; PAR-01, PAR-06, PAR-07, PAR-08). Formas de `BD:177`, mensagens de `B:110-117`.
 * A vigência é sempre hoje e vem do servidor (PAR-03): o corpo `strictObject` recusa `vigenteDesde` e qualquer outro
 * campo (PAR-08).
 */

export const LIMITES_PESO = { min: -10, max: 10 } as const;

/** PAR-06 e PAR-07: a mesma mensagem para peso não inteiro, fora da faixa ou ausente. */
export const MENSAGEM_PESO = `Use um número inteiro de ${LIMITES_PESO.min} a ${LIMITES_PESO.max}.`;

/** Os seis pesos, na ordem do formulário (t18). */
export const CAMPOS_PESO = [
  'presencaSemChuva',
  'presencaComChuva',
  'lesionadoSemChuva',
  'lesionadoComChuva',
  'expulsoSemChuva',
  'expulsoComChuva',
] as const;
export type CampoPeso = (typeof CAMPOS_PESO)[number];

export const peso = z
  .number({ error: MENSAGEM_PESO })
  // 10,5 também passa do máximo: o abort deixa uma só mensagem no campo.
  .int({ error: MENSAGEM_PESO, abort: true })
  .min(LIMITES_PESO.min, MENSAGEM_PESO)
  .max(LIMITES_PESO.max, MENSAGEM_PESO);

const formaPesos = {
  presencaSemChuva: peso,
  presencaComChuva: peso,
  lesionadoSemChuva: peso,
  lesionadoComChuva: peso,
  expulsoSemChuva: peso,
  expulsoComChuva: peso,
};

/** Corpo de `POST /api/grupos/:grupoId/pesos`: os 6 pesos, todos obrigatórios (PAR-03, PAR-06 a PAR-08). */
export const pesosCorpo = z.strictObject(formaPesos);
export type PesosCorpo = z.infer<typeof pesosCorpo>;

const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Configuração vigente: os 6 pesos, desde quando vale e o nome de quem registrou (PAR-01). */
export const configuracaoVigente = z.strictObject({
  ...formaPesos,
  vigenteDesde: dataTexto,
  registradoPor: z.string(),
});
export type ConfiguracaoVigente = z.infer<typeof configuracaoVigente>;

/** Configuração anterior: vale até a véspera da seguinte (PAR-02). */
export const configuracaoAnterior = configuracaoVigente.extend({ vigenteAte: dataTexto });
export type ConfiguracaoAnterior = z.infer<typeof configuracaoAnterior>;

/** `GET` e `POST /api/grupos/:grupoId/pesos`: o histórico vem da mais recente para a mais antiga (PAR-01, PAR-03). */
export const pesosPainel = z.strictObject({
  hoje: dataTexto,
  vigente: configuracaoVigente,
  historico: z.array(configuracaoAnterior),
});
export type PesosPainel = z.infer<typeof pesosPainel>;
