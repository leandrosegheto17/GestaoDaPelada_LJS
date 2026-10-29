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
