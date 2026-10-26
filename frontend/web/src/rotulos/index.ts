import type { DiaSemana } from '@pelada/contrato';

// SPEC_DEVIATION: o legado reúne aqui os rótulos de todos os enums do contrato. Na fundação entra só
// o rótulo de dia da semana, que a formatação de datas usa; os demais chegam com as features que os usam.
export const ROTULO_DIA_SEMANA = {
  domingo: 'Domingo',
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
} as const satisfies Record<DiaSemana, string>;
