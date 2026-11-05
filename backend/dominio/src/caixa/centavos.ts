/**
 * Aritmética do caixa em centavos inteiros (FIN-13). Nunca arredonda, nunca divide e nunca converte para decimal:
 * todo operando e todo resultado precisa ser inteiro seguro (`Number.isSafeInteger`), senão a operação lança e a
 * requisição falha, sem resposta com valor truncado. Funções puras, sem relógio nem I/O (GEL-70).
 */

/** O resultado de uma soma ou subtração saiu do inteiro seguro. */
export class ErroEstouroCentavos extends RangeError {
  constructor() {
    super('Valor do caixa fora do limite seguro.');
    this.name = 'ErroEstouroCentavos';
  }
}

/** Um operando não é inteiro seguro (decimal, NaN, infinito ou grande demais). */
export class ErroCentavosNaoInteiro extends RangeError {
  constructor() {
    super('Valor do caixa não é um inteiro em centavos.');
    this.name = 'ErroCentavosNaoInteiro';
  }
}

function exigirInteiro(valor: number): void {
  if (!Number.isSafeInteger(valor)) throw new ErroCentavosNaoInteiro();
}

function conferirResultado(valor: number): number {
  if (!Number.isSafeInteger(valor)) throw new ErroEstouroCentavos();
  return valor;
}

/**
 * Soma os valores, conferindo cada passo: um estouro no meio lança mesmo que os valores seguintes trouxessem o total
 * de volta à faixa (a soma em ponto flutuante já perdeu a exatidão nesse ponto).
 */
export function somarCentavos(valores: readonly number[]): number {
  let total = 0;
  for (const valor of valores) {
    exigirInteiro(valor);
    total = conferirResultado(total + valor);
  }
  return total;
}

/** `a − b` em centavos inteiros. */
export function subtrairCentavos(a: number, b: number): number {
  exigirInteiro(a);
  exigirInteiro(b);
  return conferirResultado(a - b);
}
