import yaml from 'js-yaml';

/**
 * Lê um YAML (ou JSON) com o parser do formato. Devolve `{ documento }` ou `{ erro }`; nunca lança.
 * Chave duplicada, tag desconhecida e sintaxe inválida são erro (falha fechado, não "sem achados").
 */
export function lerYaml(texto) {
  try {
    return { documento: yaml.load(texto) };
  } catch (erro) {
    return { erro: String(erro.reason ?? erro.message ?? erro).split('\n')[0] };
  }
}

/** Percorre o documento inteiro e chama `visitar(objeto)` em cada mapeamento (em qualquer profundidade). */
export function percorrerMapas(documento, visitar) {
  if (Array.isArray(documento)) {
    for (const item of documento) percorrerMapas(item, visitar);
  } else if (documento && typeof documento === 'object') {
    visitar(documento);
    for (const valor of Object.values(documento)) percorrerMapas(valor, visitar);
  }
}

/** Número da linha (1 = primeira) da primeira ocorrência de `trecho` no texto; 1 se não achar. */
export function linhaDe(texto, trecho) {
  const indice = texto.split(/\r?\n/).findIndex((linha) => linha.includes(trecho));
  return indice === -1 ? 1 : indice + 1;
}
