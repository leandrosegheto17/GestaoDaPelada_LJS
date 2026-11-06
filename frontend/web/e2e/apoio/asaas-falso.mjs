/**
 * Servidor falso do Asaas para o e2e (T30; PLA-36, PLA-53). O Playwright o sobe antes do `wrangler dev`, que recebe
 * `ASAAS_URL` apontando para cá (`playwright.config.ts`). Responde às 4 rotas que a API usa, no formato do Asaas, com
 * uma fatura falsa, e tem um endpoint só de teste que dispara o webhook no Worker com o token, como o Asaas faria.
 *
 * - `POST /v3/customers`, `POST /v3/subscriptions`, `GET /v3/subscriptions/:id/payments`, `DELETE /v3/subscriptions/:id`
 *   exigem o header `access_token` (sem ele, 401, como o Asaas);
 * - `GET /fatura/:id`: página HTML da fatura falsa;
 * - `POST /teste/webhook` `{ "event": "PAYMENT_RECEIVED", "subscription": "sub_…" }`: monta o evento da cobrança da
 *   assinatura e o envia ao webhook do Worker com `asaas-access-token`; responde com o status que o Worker deu;
 * - `POST /teste/falhar` `{ "rota": "subscriptions", "vezes": 1 }`: as próximas `vezes` chamadas daquela rota dão 500;
 * - `GET /teste/estado`: clientes e assinaturas, para as asserções.
 *
 * Nada aqui é segredo: o token e a chave do e2e são valores falsos passados por variável.
 */
import { createServer } from 'node:http';

/** Lê o corpo JSON da requisição (vazio = `{}`). */
async function lerJson(req) {
  let texto = '';
  for await (const parte of req) texto += parte;
  if (texto === '') return {};
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function responder(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

const hojeUtc = () => new Date().toISOString().slice(0, 10);
const agoraAsaas = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/**
 * Sobe o servidor. `porta` 0 escolhe uma livre.
 * @param {{ porta?: number, urlWebhook?: string, tokenWebhook?: string }} [opcoes]
 */
export async function iniciarAsaasFalso(opcoes = {}) {
  const clientes = new Map();
  const assinaturas = new Map();
  const falhas = new Map();
  let sequencia = 0;
  let eventos = 0;
  // Marca da execução: o banco do e2e persiste entre execuções, e ids repetidos colidiriam com os de antes.
  const marca = Math.random().toString(36).slice(2, 8);
  const proximoId = (prefixo) => `${prefixo}_${marca}_${String(++sequencia).padStart(6, '0')}`;
  let base;
  const URL_FATURA_FALSA = 'https://fatura-falsa.asaas.test';

  const deveFalhar = (rota) => {
    const n = falhas.get(rota) ?? 0;
    if (n <= 0) return false;
    falhas.set(rota, n - 1);
    return true;
  };

  const cobrancaDe = (a) => ({
    object: 'payment',
    id: a.pagamento,
    customer: a.customer,
    subscription: a.id,
    value: a.value,
    dueDate: a.nextDueDate,
    status: 'PENDING',
    billingType: 'UNDEFINED',
    // https por exigência do banco (`assinaturas.fatura_url ~ '^https://'`); o e2e atende este host por interceptação.
    invoiceUrl: `${URL_FATURA_FALSA}/fatura/${a.pagamento}`,
  });

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const caminho = url.pathname;

    if (req.method === 'GET' && caminho.startsWith('/fatura/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="pt-BR"><body><h1>Fatura de teste do Asaas</h1></body></html>',
      );
      return;
    }

    if (caminho.startsWith('/teste/')) {
      if (req.method === 'GET' && caminho === '/teste/estado') {
        responder(res, 200, {
          clientes: [...clientes.values()],
          assinaturas: [...assinaturas.values()],
        });
        return;
      }
      const corpo = await lerJson(req);
      if (corpo === null) return responder(res, 400, { erro: 'json' });
      if (req.method === 'POST' && caminho === '/teste/falhar') {
        falhas.set(String(corpo.rota), Number(corpo.vezes ?? 1));
        return responder(res, 200, {});
      }
      if (req.method === 'POST' && caminho === '/teste/webhook') {
        const a = assinaturas.get(String(corpo.subscription));
        if (!a || !opcoes.urlWebhook || !opcoes.tokenWebhook)
          return responder(res, 404, { erro: 'assinatura' });
        const evento = String(corpo.event);
        eventos += 1;
        const payload = {
          id: `evt_falso_${marca}_${String(eventos).padStart(6, '0')}`,
          event: evento,
          dateCreated: agoraAsaas(),
          ...(evento.startsWith('SUBSCRIPTION_')
            ? { subscription: { object: 'subscription', id: a.id } }
            : { payment: { ...cobrancaDe(a), value: corpo.value ?? a.value } }),
        };
        const r = await fetch(opcoes.urlWebhook, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'asaas-access-token': opcoes.tokenWebhook,
          },
          body: JSON.stringify(payload),
        });
        return responder(res, 200, { status: r.status, id: payload.id });
      }
      return responder(res, 404, { erro: 'rota' });
    }

    if (!caminho.startsWith('/v3/'))
      return responder(res, 404, { errors: [{ code: 'not_found' }] });
    if (!req.headers['access_token']) {
      return responder(res, 401, {
        errors: [{ code: 'invalid_access_token', description: 'Chave ausente.' }],
      });
    }

    const corpo = req.method === 'POST' ? await lerJson(req) : {};
    if (corpo === null) return responder(res, 400, { errors: [{ code: 'invalid_json' }] });

    if (req.method === 'POST' && caminho === '/v3/customers') {
      if (deveFalhar('customers')) return responder(res, 500, { errors: [{ code: 'erro' }] });
      if (!corpo.name || !corpo.cpfCnpj)
        return responder(res, 400, { errors: [{ code: 'invalid_customer' }] });
      const id = proximoId('cus');
      // O CPF não fica no estado: o falso só confere que veio.
      clientes.set(id, {
        id,
        name: corpo.name,
        email: corpo.email,
        externalReference: corpo.externalReference,
      });
      return responder(res, 200, { object: 'customer', id });
    }

    if (req.method === 'POST' && caminho === '/v3/subscriptions') {
      if (deveFalhar('subscriptions')) return responder(res, 500, { errors: [{ code: 'erro' }] });
      if (!clientes.has(corpo.customer))
        return responder(res, 400, { errors: [{ code: 'invalid_customer' }] });
      const id = proximoId('sub');
      const a = {
        id,
        pagamento: proximoId('pay'),
        customer: corpo.customer,
        billingType: corpo.billingType,
        cycle: corpo.cycle,
        value: corpo.value,
        nextDueDate: corpo.nextDueDate ?? hojeUtc(),
        description: corpo.description,
        externalReference: corpo.externalReference,
        deleted: false,
      };
      assinaturas.set(id, a);
      return responder(res, 200, { object: 'subscription', id, status: 'ACTIVE' });
    }

    const pagamentos = /^\/v3\/subscriptions\/([^/]+)\/payments$/.exec(caminho);
    if (req.method === 'GET' && pagamentos) {
      if (deveFalhar('payments')) return responder(res, 500, { errors: [{ code: 'erro' }] });
      const a = assinaturas.get(decodeURIComponent(pagamentos[1]));
      if (!a) return responder(res, 404, { errors: [{ code: 'not_found' }] });
      return responder(res, 200, {
        object: 'list',
        hasMore: false,
        totalCount: 1,
        data: a.deleted ? [] : [cobrancaDe(a)],
      });
    }

    const uma = /^\/v3\/subscriptions\/([^/]+)$/.exec(caminho);
    if (req.method === 'DELETE' && uma) {
      if (deveFalhar('delete')) return responder(res, 500, { errors: [{ code: 'erro' }] });
      const a = assinaturas.get(decodeURIComponent(uma[1]));
      if (!a) return responder(res, 404, { errors: [{ code: 'not_found' }] });
      a.deleted = true;
      return responder(res, 200, { deleted: true, id: a.id });
    }

    return responder(res, 404, { errors: [{ code: 'not_found' }] });
  });

  await new Promise((resolver) => servidor.listen(opcoes.porta ?? 0, '127.0.0.1', resolver));
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0;
  base = `http://127.0.0.1:${porta}`;

  return {
    url: `${base}/v3`,
    base,
    porta,
    assinaturas,
    clientes,
    fechar: () => new Promise((resolver) => servidor.close(() => resolver(undefined))),
  };
}

if (import.meta.main) {
  const porta = Number(process.env.ASAAS_FALSO_PORTA ?? 8789);
  const s = await iniciarAsaasFalso({
    porta,
    urlWebhook: process.env.ASAAS_FALSO_WEBHOOK,
    tokenWebhook: process.env.ASAAS_FALSO_TOKEN,
  });
  console.log(`asaas falso em ${s.url}`);
}
