const MENOS = '−';

/** Centavos inteiros → `R$ 1.234,56` (negativo: `− R$ 1.234,56`). */
export function formatarMoeda(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new RangeError(`Centavos inválidos: ${centavos}.`);
  const absoluto = Math.abs(centavos);
  const reais = String(Math.trunc(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = String(absoluto % 100).padStart(2, '0');
  return `${centavos < 0 ? `${MENOS} ` : ''}R$ ${reais},${resto}`;
}

export type MotivoMoeda = 'vazio' | 'formato' | 'casas' | 'faixa';
export type ResultadoMoeda = { ok: true; centavos: number } | { ok: false; motivo: MotivoMoeda };

const NUMERO = /^([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,([0-9]*))?$/;

/** Texto digitado em reais → centavos. Recusa mais de 2 casas e valores fora de `[min, max]`. */
export function lerMoeda(texto: string, faixa: { min: number; max: number }): ResultadoMoeda {
  let resto = texto.trim();
  if (resto === '' || resto === 'R$') return { ok: false, motivo: 'vazio' };
  if (resto.startsWith('R$')) resto = resto.slice(2).trim();
  let negativo = false;
  if (resto.startsWith('-') || resto.startsWith(MENOS)) {
    if (faixa.min >= 0) return { ok: false, motivo: 'formato' };
    negativo = true;
    resto = resto.slice(1).trim();
  }
  const achado = NUMERO.exec(resto);
  if (!achado || achado[2] === '') return { ok: false, motivo: 'formato' };
  const decimais = achado[2] ?? '';
  if (decimais.length > 2) return { ok: false, motivo: 'casas' };
  const reais = BigInt((achado[1] ?? '0').replaceAll('.', ''));
  const total = reais * 100n + BigInt(decimais.padEnd(2, '0'));
  const valor = negativo ? -total : total;
  if (valor < BigInt(faixa.min) || valor > BigInt(faixa.max)) return { ok: false, motivo: 'faixa' };
  return { ok: true, centavos: Number(valor) };
}
