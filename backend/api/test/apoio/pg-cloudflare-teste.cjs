'use strict';
/**
 * `pg-cloudflare` para o projeto `worker` dos testes. Quando o cliente fecha o socket (`client.end()`), a leitura de
 * `_listen` rejeita com "Stream was cancelled": Ã© o fim normal da conexÃ£o, mas a promessa fica sem tratamento e o
 * vitest derruba a rodada. SÃ³ essa mensagem Ã© engolida; qualquer outro erro continua rejeitando.
 */
// Módulo CommonJS carregado pelo workerd: `require` é o único jeito de pegar o `pg-cloudflare` real.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const real = require('pg-cloudflare');

const original = real.CloudflareSocket.prototype._listen;
real.CloudflareSocket.prototype._listen = async function listen(...args) {
  try {
    return await original.apply(this, args);
  } catch (erro) {
    if (erro && String(erro.message).startsWith('Stream was cancelled')) return undefined;
    throw erro;
  }
};

module.exports = real;
