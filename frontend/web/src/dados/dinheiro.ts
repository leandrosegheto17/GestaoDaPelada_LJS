/**
 * Dinheiro no front (financeiro T35; FIN-15, FIN-48). Todo valor anda em centavos inteiros, como na API; a conversão
 * de e para reais é feita por texto, sem ponto flutuante: nada de conversão de texto para número com vírgula nem de
 * arredondamento de casas decimais (o teste confere por texto que este arquivo não usa as duas funções da linguagem).
 *
 * - `formatarReais(124550)` → "R$ 1.245,50"; negativo com o sinal de menos e um espaço, como o mockup do t22
 *   (`t22-financeiro--sucesso.html:52`): `formatarReais(-90000)` → "− R$ 900,00" (U+2212).
 * - `lerReais("1.245,50")` → 124550. Aceita "350", "350,0", "350,00", milhar com ponto em grupos de 3 ("1.245,50") ou
 *   sem ponto ("1245,50"), sinal de menos na frente ("-15,00" ou "−15,00", para o saldo inicial negativo) e o prefixo
 *   "R$". Recusa mais de 2 casas ("12,345"), mais de uma vírgula ("1,2,3"), letras, vazio e valor além do inteiro
 *   seguro, com "Informe um valor em reais, ex.: 350,00.". A faixa permitida (mensalidade de 1 centavo em diante, teto
 *   de 99.999.999) é da API (FIN-03), que responde 422 no campo.
 */

export const MENSAGEM_VALOR_REAIS = 'Informe um valor em reais, ex.: 350,00.';

/** U+2212, o sinal de menos tipográfico do mockup. */
export const SINAL_MENOS = '−';

function milhares(inteiro: number): string {
  const texto = String(inteiro);
  const partes: string[] = [];
  for (let fim = texto.length; fim > 0; fim -= 3) partes.unshift(texto.slice(Math.max(0, fim - 3), fim));
  return partes.join('.');
}

/** Centavos inteiros em "R$ 1.245,50"; negativo em "− R$ 900,00". */
export function formatarReais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new RangeError(`Valor em centavos inválido: ${centavos}`);
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, '0');
  const texto = `R$ ${milhares(reais)},${resto}`;
  return centavos < 0 ? `${SINAL_MENOS} ${texto}` : texto;
}

export type LeituraReais = { ok: true; centavos: number } | { ok: false; mensagem: string };

const FORMATO = /^([-−])?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** Texto em reais para centavos inteiros, só com operações de texto e inteiros. */
export function lerReais(texto: string): LeituraReais {
  const m = FORMATO.exec(texto.trim());
  if (!m) return { ok: false, mensagem: MENSAGEM_VALOR_REAIS };
  const negativo = m[1] !== undefined;
  const inteiro = (m[2] ?? '').replaceAll('.', '');
  const casas = (m[3] ?? '').padEnd(2, '0');
  // Só dígitos chegam aqui: o `Number` de "1245" e de "50" é exato até o inteiro seguro, conferido abaixo.
  const reais = Number(inteiro);
  const centavos = reais * 100 + Number(casas);
  if (!Number.isSafeInteger(reais) || !Number.isSafeInteger(centavos)) return { ok: false, mensagem: MENSAGEM_VALOR_REAIS };
  return { ok: true, centavos: negativo && centavos !== 0 ? -centavos : centavos };
}
