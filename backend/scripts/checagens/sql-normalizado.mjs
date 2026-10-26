/**
 * Normaliza SQL para as checagens: remove comentários (de linha e de bloco aninhado), troca strings,
 * dollar-quoted e identificadores entre aspas por marcadores vazios, colapsa espaços e usa minúsculas.
 * Devolve o texto e, para cada caractere, a linha original (para apontar o achado).
 */
export function normalizarSql(texto) {
  let saida = '';
  const linhas = [];
  let linha = 1;
  let i = 0;
  const emitir = (trecho, linhaDoTrecho) => {
    for (const c of trecho) {
      if (/\s/.test(c)) {
        if (saida.length > 0 && !saida.endsWith(' ')) {
          saida += ' ';
          linhas.push(linhaDoTrecho);
        }
      } else {
        saida += c.toLowerCase();
        linhas.push(linhaDoTrecho);
      }
    }
  };
  const avancar = (ate) => {
    for (; i < ate; i++) if (texto[i] === '\n') linha++;
  };

  while (i < texto.length) {
    const c = texto[i];
    const proximo = texto[i + 1];
    if (c === '-' && proximo === '-') {
      const fim = texto.indexOf('\n', i);
      avancar(fim === -1 ? texto.length : fim);
      emitir(' ', linha);
    } else if (c === '/' && proximo === '*') {
      let profundidade = 1;
      let j = i + 2;
      while (j < texto.length && profundidade > 0) {
        if (texto[j] === '/' && texto[j + 1] === '*') {
          profundidade++;
          j += 2;
        } else if (texto[j] === '*' && texto[j + 1] === '/') {
          profundidade--;
          j += 2;
        } else j++;
      }
      if (profundidade > 0) throw new Error('comentário de bloco não fechado');
      avancar(j);
      emitir(' ', linha);
    } else if (c === "'" || ((c === 'E' || c === 'e') && proximo === "'")) {
      const escapado = c !== "'";
      let j = i + (escapado ? 2 : 1);
      let fechado = false;
      while (j < texto.length) {
        if (escapado && texto[j] === '\\') j += 2;
        else if (texto[j] === "'" && texto[j + 1] === "'") j += 2;
        else if (texto[j] === "'") {
          j++;
          fechado = true;
          break;
        } else j++;
      }
      if (!fechado) throw new Error('string não fechada');
      const inicio = linha;
      avancar(j);
      emitir("''", inicio);
    } else if (c === '"') {
      const fim = texto.indexOf('"', i + 1);
      if (fim === -1) throw new Error('identificador entre aspas não fechado');
      const inicio = linha;
      avancar(fim + 1);
      emitir('""', inicio);
    } else if (c === '$') {
      const abertura = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texto.slice(i));
      if (abertura) {
        const fim = texto.indexOf(abertura[0], i + abertura[0].length);
        if (fim === -1) throw new Error('dollar-quoted não fechado');
        const inicio = linha;
        avancar(fim + abertura[0].length);
        emitir("''", inicio);
      } else {
        emitir(c, linha);
        avancar(i + 1);
      }
    } else {
      const inicio = linha;
      avancar(i + 1);
      emitir(c, inicio);
    }
  }
  return { texto: saida.trim(), linhas };
}
