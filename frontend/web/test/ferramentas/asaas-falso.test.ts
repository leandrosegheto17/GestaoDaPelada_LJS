// @vitest-environment node
import { createServer, type IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { iniciarAsaasFalso, type AsaasFalso } from '../../e2e/apoio/asaas-falso.mjs';

/**
 * Servidor falso do Asaas (T30; PLA-36, PLA-53).
 *
 * SPEC_DEVIATION: o Vitest do web só lê `test/**`; o servidor fica em `e2e/apoio/asaas-falso.mjs` (o lugar da tarefa) e o
 * teste aqui, como os de `e2e/ferramentas/` (molde: `test/ferramentas/comparar.test.ts`).
 */

const CHAVE = { access_token: 'chave-falsa-do-e2e', 'content-type': 'application/json' };
let falso: AsaasFalso | undefined;
let receptor: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  await falso?.fechar();
  falso = undefined;
  await new Promise((r) => (receptor ? receptor.close(() => r(undefined)) : r(undefined)));
  receptor = undefined;
});

async function post(caminho: string, corpo: unknown, cabecalhos: Record<string, string> = CHAVE) {
  return fetch(`${falso?.url}${caminho}`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
}

describe('asaas falso', () => {
  it('PLA-53: responde às 4 rotas no formato do Asaas, com a fatura falsa', async () => {
    falso = await iniciarAsaasFalso();
    const cliente = (await (
      await post('/customers', { name: 'Maria', cpfCnpj: '52998224725' })
    ).json()) as { id: string };
    expect(cliente.id).toMatch(/^cus_/);

    const r = await post('/subscriptions', {
      customer: cliente.id,
      billingType: 'UNDEFINED',
      cycle: 'MONTHLY',
      value: 9.9,
      nextDueDate: '2026-11-05',
      externalReference: 'grupo-1',
    });
    expect(r.status).toBe(200);
    const assinatura = (await r.json()) as { id: string };
    expect(assinatura.id).toMatch(/^sub_/);

    const lista = (await (
      await fetch(`${falso.url}/subscriptions/${assinatura.id}/payments`, { headers: CHAVE })
    ).json()) as {
      data: Array<{ id: string; invoiceUrl: string; value: number; dueDate: string }>;
    };
    expect(lista.data).toHaveLength(1);
    expect(lista.data[0]).toMatchObject({ value: 9.9, dueDate: '2026-11-05' });
    // A fatura vem em https (o banco exige) num host que o e2e atende por interceptação; a página mora no falso.
    const faturaUrl = lista.data[0]?.invoiceUrl ?? '';
    expect(faturaUrl).toMatch(/^https:\/\/fatura-falsa\.asaas\.test\/fatura\//);
    const fatura = await fetch(`${falso.base}${new URL(faturaUrl).pathname}`);
    expect(fatura.status).toBe(200);
    expect(await fatura.text()).toContain('Fatura de teste');

    const apagada = await fetch(`${falso.url}/subscriptions/${assinatura.id}`, {
      method: 'DELETE',
      headers: CHAVE,
    });
    expect(await apagada.json()).toEqual({ deleted: true, id: assinatura.id });
  });

  it('PLA-36: recusa access_token ausente com 401 em toda rota do Asaas', async () => {
    falso = await iniciarAsaasFalso();
    const semChave = { 'content-type': 'application/json' };
    expect((await post('/customers', { name: 'x', cpfCnpj: '1' }, semChave)).status).toBe(401);
    expect((await post('/subscriptions', {}, semChave)).status).toBe(401);
    expect((await fetch(`${falso.url}/subscriptions/sub_1/payments`)).status).toBe(401);
    expect((await fetch(`${falso.url}/subscriptions/sub_1`, { method: 'DELETE' })).status).toBe(
      401,
    );
  });

  it('PLA-36: /teste/falhar faz a próxima chamada da rota dar 500', async () => {
    falso = await iniciarAsaasFalso();
    await fetch(`${falso.base}/teste/falhar`, {
      method: 'POST',
      body: JSON.stringify({ rota: 'customers', vezes: 1 }),
    });
    expect((await post('/customers', { name: 'Maria', cpfCnpj: '52998224725' })).status).toBe(500);
    expect((await post('/customers', { name: 'Maria', cpfCnpj: '52998224725' })).status).toBe(200);
  });

  it('dispara o webhook no endereço configurado com o token, como o Asaas', async () => {
    const recebidos: Array<{
      token: string | undefined;
      corpo: { event: string; payment?: { subscription: string } };
    }> = [];
    receptor = createServer(async (req: IncomingMessage, res) => {
      let texto = '';
      for await (const parte of req) texto += parte;
      recebidos.push({
        token: req.headers['asaas-access-token'] as string | undefined,
        corpo: JSON.parse(texto),
      });
      res.writeHead(200).end();
    });
    await new Promise((r) => receptor?.listen(0, '127.0.0.1', () => r(undefined)));
    const endereco = receptor.address();
    const porta = typeof endereco === 'object' && endereco ? endereco.port : 0;

    falso = await iniciarAsaasFalso({
      urlWebhook: `http://127.0.0.1:${porta}/api/webhooks/asaas`,
      tokenWebhook: 'token-falso-do-webhook-do-e2e-com-32-caracteres',
    });
    const cliente = (await (
      await post('/customers', { name: 'Maria', cpfCnpj: '52998224725' })
    ).json()) as { id: string };
    const assinatura = (await (
      await post('/subscriptions', { customer: cliente.id, value: 9.9 })
    ).json()) as { id: string };

    const disparo = await fetch(`${falso.base}/teste/webhook`, {
      method: 'POST',
      body: JSON.stringify({ event: 'PAYMENT_RECEIVED', subscription: assinatura.id }),
    });
    expect(await disparo.json()).toMatchObject({ status: 200 });
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]?.token).toBe('token-falso-do-webhook-do-e2e-com-32-caracteres');
    expect(recebidos[0]?.corpo.event).toBe('PAYMENT_RECEIVED');
    expect(recebidos[0]?.corpo.payment?.subscription).toBe(assinatura.id);
  });
});
