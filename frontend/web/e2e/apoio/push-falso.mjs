/**
 * Serviço de push falso para o e2e e o ambiente local (notificacoes T27; NOT-63). Faz o papel do FCM ou do Mozilla
 * Push: recebe o `POST` cifrado que a API manda ao `endpoint` da assinatura e guarda o que chegou, para a jornada
 * (T41) conferir que o aviso saiu. A API só aceita este endereço com `PUSH_HOSTS_DEV=localhost:<porta>` (só no
 * `.env` local e no e2e; checagem `push-hosts-dev`).
 *
 * - `POST /push/:token`: guarda o caminho, os cabeçalhos do Web Push (`ttl`, `topic`, `urgency`, `content-encoding` e
 *   se veio `authorization`) e o tamanho do corpo; responde com o próximo status da fila (padrão 201, sem corpo);
 * - `POST /teste/responder` `{ "status": [503, 410] }`: as próximas respostas, na ordem;
 * - `GET /teste/recebidas`: o que chegou, do mais antigo ao mais novo;
 * - `POST /teste/limpar`: esvazia o que chegou e a fila de respostas;
 * - `GET /saude`: 200, para o Playwright saber que subiu.
 *
 * O corpo cifrado não é guardado nem decifrado: o servidor não tem a chave do navegador, como o serviço de verdade.
 */
import { createServer } from 'node:http';

async function lerCorpo(req) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
  return Buffer.concat(partes);
}

function responderJson(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

/**
 * Sobe o servidor. `porta` 0 escolhe uma livre.
 * @param {{ porta?: number }} [opcoes]
 */
export async function iniciarPushFalso(opcoes = {}) {
  /** @type {Array<{ caminho: string, ttl: string | null, topic: string | null, urgency: string | null, contentEncoding: string | null, comAutorizacao: boolean, bytes: number }>} */
  const recebidas = [];
  /** @type {number[]} */
  const respostas = [];

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/saude')
      return responderJson(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/teste/recebidas')
      return responderJson(res, 200, { recebidas });
    if (req.method === 'POST' && url.pathname === '/teste/limpar') {
      recebidas.length = 0;
      respostas.length = 0;
      await lerCorpo(req);
      return responderJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/teste/responder') {
      let corpo;
      try {
        corpo = JSON.parse((await lerCorpo(req)).toString('utf8') || '{}');
      } catch {
        return responderJson(res, 400, { erro: 'json' });
      }
      const lista = Array.isArray(corpo.status) ? corpo.status : [];
      for (const s of lista) if (Number.isInteger(s) && s >= 100 && s <= 599) respostas.push(s);
      return responderJson(res, 200, { fila: respostas.length });
    }
    if (req.method === 'POST' && /^\/push\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      const corpo = await lerCorpo(req);
      recebidas.push({
        caminho: url.pathname,
        ttl: req.headers['ttl'] ?? null,
        topic: req.headers['topic'] ?? null,
        urgency: req.headers['urgency'] ?? null,
        contentEncoding: req.headers['content-encoding'] ?? null,
        comAutorizacao:
          typeof req.headers['authorization'] === 'string' &&
          req.headers['authorization'].startsWith('vapid '),
        bytes: corpo.length,
      });
      res.writeHead(respostas.shift() ?? 201);
      return res.end();
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolver) => servidor.listen(opcoes.porta ?? 0, '127.0.0.1', resolver));
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0;

  return {
    /** Base do `endpoint` das assinaturas falsas: `http://localhost:<porta>/push/`. */
    base: `http://localhost:${porta}`,
    porta,
    /** O valor de `PUSH_HOSTS_DEV` que libera este servidor. */
    hostsDev: `localhost:${porta}`,
    recebidas,
    fechar: () => new Promise((resolver) => servidor.close(() => resolver(undefined))),
  };
}

if (import.meta.main) {
  const porta = Number(process.env.PUSH_FALSO_PORTA ?? 8790);
  const s = await iniciarPushFalso({ porta });
  console.log(`push falso em ${s.base} (PUSH_HOSTS_DEV=${s.hostsDev})`);
}
