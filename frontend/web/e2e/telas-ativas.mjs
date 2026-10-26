/** Lê a lista de telas ativas (um id por linha; `#` comenta). Id fora de `idsValidos` é erro. */
export function lerTelasAtivas(texto, idsValidos) {
  const validos = new Set(idsValidos);
  const ids = new Set();
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/#.*$/, '').trim();
    if (linha === '') continue;
    if (!validos.has(linha)) throw new Error(`Tela "${linha}" não existe em telas.json.`);
    ids.add(linha);
  }
  return [...ids];
}
