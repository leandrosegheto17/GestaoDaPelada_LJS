import { createInterface } from 'node:readline/promises';

/**
 * Lê uma senha sem eco. Em terminal, o eco é suprimido; com pipe (testes, automação), lê uma linha da entrada padrão.
 * A senha nunca é impressa.
 */
export async function lerSenhaSemEco(pergunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY) {
    const leitura = createInterface({ input: entrada });
    try {
      process.stderr.write(pergunta);
      for await (const linha of leitura) return linha;
      return '';
    } finally {
      leitura.close();
    }
  }
  process.stderr.write(pergunta);
  return new Promise<string>((ok, falha) => {
    let digitado = '';
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const fim = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', aoLer);
      process.stderr.write('\n');
    };
    const aoLer = (pedaco: string) => {
      for (const c of pedaco) {
        if (c === '\r' || c === '\n') {
          fim();
          return ok(digitado);
        }
        if (c === '\u0003') {
          fim();
          return falha(new Error('Cancelado.'));
        }
        if (c === '\u007f' || c === '\b') digitado = digitado.slice(0, -1);
        else digitado += c;
      }
    };
    entrada.on('data', aoLer);
  });
}
