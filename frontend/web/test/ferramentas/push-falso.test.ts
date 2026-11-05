// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { iniciarPushFalso, type PushFalso } from '../../e2e/apoio/push-falso.mjs';

/**
 * Serviço de push falso do e2e (notificacoes T27; NOT-63).
 *
 * SPEC_DEVIATION: o Vitest do web só lê `test/**`; o servidor fica em `e2e/apoio/push-falso.mjs`, ao lado do
 * `asaas-falso.mjs`, e o teste aqui, como o dele (molde: `test/ferramentas/asaas-falso.test.ts`).
 */

let falso: PushFalso | undefined;

afterEach(async () => {
  await falso?.fechar();
  falso = undefined;
});

/** O `POST` que a API faz ao endpoint de uma assinatura (T6), com corpo binário. */
function enviar(caminho: string): Promise<Response> {
  return fetch(`${falso?.base}${caminho}`, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'normal',
      topic: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      authorization: 'vapid t=a.b.c, k=BPub',
    },
    body: new Uint8Array(120).fill(7),
  });
}

describe('push falso', () => {
  it('NOT-63: guarda o POST recebido com os cabeçalhos do Web Push e responde 201', async () => {
    falso = await iniciarPushFalso();
    expect(falso.base).toBe(`http://localhost:${falso.porta}`);
    expect(falso.hostsDev).toBe(`localhost:${falso.porta}`);

    const r = await enviar('/push/aparelho-1');
    expect(r.status).toBe(201);
    const lista = await (await fetch(`${falso.base}/teste/recebidas`)).json();
    expect(lista.recebidas).toEqual([
      {
        caminho: '/push/aparelho-1',
        ttl: '86400',
        topic: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
        urgency: 'normal',
        contentEncoding: 'aes128gcm',
        comAutorizacao: true,
        bytes: 120,
      },
    ]);
  });

  it('NOT-63: responde na ordem os status pedidos e volta a 201 depois', async () => {
    falso = await iniciarPushFalso();
    await fetch(`${falso.base}/teste/responder`, {
      method: 'POST',
      body: JSON.stringify({ status: [503, 410] }),
    });
    expect((await enviar('/push/a')).status).toBe(503);
    expect((await enviar('/push/a')).status).toBe(410);
    expect((await enviar('/push/a')).status).toBe(201);
    expect(falso.recebidas).toHaveLength(3);
  });

  it('limpar esvazia o que chegou; caminho fora de /push/ é 404 e não é guardado', async () => {
    falso = await iniciarPushFalso();
    await enviar('/push/a');
    await fetch(`${falso.base}/teste/limpar`, { method: 'POST' });
    expect(falso.recebidas).toEqual([]);
    expect((await enviar('/outro/a')).status).toBe(404);
    expect((await fetch(`${falso.base}/saude`)).status).toBe(200);
    expect(falso.recebidas).toEqual([]);
  });
});
