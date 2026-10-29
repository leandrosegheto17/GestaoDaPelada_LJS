/** `AAAA-MM-DD`. Datas de negócio são texto de calendário, sem fuso; o "hoje" sempre vem de fora (GEL-70). */
export type Data = string;

/** Texto `AAAA-MM-DD` que existe no calendário (recusa `2026-02-30`, hora, espaços e não texto). */
export function ehDataValida(valor: unknown): valor is Data {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number) as [number, number, number];
  const t = new Date(0);
  t.setUTCFullYear(a, m - 1, d);
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Garante que `hoje` é uma data real; recusa com mensagem clara em vez de produzir um número sem sentido. */
export function exigirData(valor: string, nome = 'Data'): Data {
  if (!ehDataValida(valor)) throw new RangeError(`${nome} inválida: ${JSON.stringify(valor)}. Use AAAA-MM-DD.`);
  return valor;
}

/** Negativo, zero ou positivo. O formato fixo torna a comparação de texto correta. */
export function compararDatas(a: Data, b: Data): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

/** Soma `n` dias de calendário (pode ser negativo). */
export function somarDias(data: Data, n: number): Data {
  const [a, m, d] = data.split('-').map(Number) as [number, number, number];
  const t = new Date(0);
  t.setUTCFullYear(a, m - 1, d + n);
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`;
}
