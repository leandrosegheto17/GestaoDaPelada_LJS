// ADR-033: a conexão da transação da requisição desiste em 8 s (sem nova tentativa), em vez de esperar o socket.
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  abrirTransacaoDaRequisicao,
  TEMPO_LIMITE_CONEXAO_MS,
} from '../../src/infraestrutura/db/transacao-da-requisicao.ts';

let servidor: Server | undefined;
const sockets: Socket[] = [];
let conexoes = 0;

/** Servidor que aceita a conexão TCP e nunca responde (como um Postgres travado ou um proxy mudo). */
async function servidorMudo(): Promise<number> {
  servidor = createServer((socket) => {
    conexoes += 1;
    sockets.push(socket);
  });
  await new Promise<void>((ok) => servidor?.listen(0, '127.0.0.1', ok));
  return (servidor.address() as { port: number }).port;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok(undefined)));
  servidor = undefined;
  conexoes = 0;
});

describe('transação da requisição: tempo limite de conexão', () => {
  it('é de 8 s', () => {
    expect(TEMPO_LIMITE_CONEXAO_MS).toBe(8_000);
  });

  it('servidor que não responde: a consulta falha perto dos 8 s, com uma tentativa só', async () => {
    const porta = await servidorMudo();
    const transacao = abrirTransacaoDaRequisicao({
      connectionString: () => `postgres://pelada_app:x@127.0.0.1:${porta}/pelada`,
      somenteLeitura: true,
      contexto: () => ({}),
    });
    const inicio = performance.now();
    await expect(transacao.db.selectNoFrom((eb) => eb.lit(1).as('um')).execute()).rejects.toThrow(/timeout/i);
    const decorrido = performance.now() - inicio;
    await transacao.fechar();

    expect(decorrido).toBeGreaterThanOrEqual(7_500);
    expect(decorrido).toBeLessThan(15_000);
    expect(conexoes).toBe(1);
  }, 30_000);
});
