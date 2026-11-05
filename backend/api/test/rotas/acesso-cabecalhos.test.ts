import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import {
  criarWorker,
  type EmbrulharSentry,
  type Manipulador,
} from '../../src/entrada/observabilidade.ts';

/**
 * Sem cache e sem segredo no log nas rotas de acesso (T31; ACE-21, ACE-53). Roda no `workerd`,
 * sem banco: as rotas respondem 422 (corpo inválido), 503 (banco fora), 429 (limitador) ou 500
 * (erro forçado), e cada resposta é conferida.
 */

const SENHA = 'SenhaMarcadora-7f3a91Q';
/** Token marcador no formato do contrato (43 caracteres de base64url). */
const TOKEN = `TokenMarcador${'Z'.repeat(30)}`;
const MARCADORES = [SENHA, TOKEN];

const permite: LimiteDeTaxa = { limit: async () => ({ success: true }) };
const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };

function env(extra: Partial<Env> = {}): Env {
  return {
    VERSAO: 'v',
    URL_PUBLICA: 'https://pelada.exemplo.test',
    HYPERDRIVE: { connectionString: 'postgres://ninguem:nada@127.0.0.1:1/nada' },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: permite,
    ...extra,
  } as unknown as Env;
}

/** HYPERDRIVE cuja leitura lança: a rota cai no `onError` (500 forçado). */
const hyperdriveQueLanca = {
  get connectionString(): string {
    throw new Error('falha forçada');
  },
};

interface Caso {
  metodo: string;
  caminho: string;
  corpo?: unknown;
}

/** Todas as rotas de /api/sessao e /api/conta, com corpos que levam os marcadores. */
const ROTAS: Caso[] = [
  { metodo: 'GET', caminho: '/api/sessao' },
  {
    metodo: 'POST',
    caminho: '/api/sessao/entrar',
    corpo: { email: 'ana@exemplo.test', senha: SENHA },
  },
  { metodo: 'POST', caminho: '/api/sessao/sair' },
  { metodo: 'POST', caminho: '/api/sessao/esqueci-senha', corpo: { email: 'ana@exemplo.test' } },
  { metodo: 'POST', caminho: '/api/sessao/nova-senha', corpo: { token: TOKEN, senha: SENHA } },
  {
    metodo: 'POST',
    caminho: '/api/conta',
    corpo: { nome: 'Ana', email: 'ana@exemplo.test', senha: SENHA, termos: true },
  },
  { metodo: 'POST', caminho: '/api/conta/confirmar', corpo: { token: TOKEN } },
  {
    metodo: 'POST',
    caminho: '/api/conta/reenviar-confirmacao',
    corpo: { email: 'ana@exemplo.test' },
  },
  {
    metodo: 'POST',
    caminho: '/api/conta/senha',
    corpo: { senhaAtual: SENHA, senhaNova: `${SENHA}-nova` },
  },
  { metodo: 'POST', caminho: '/api/conta/excluir', corpo: { senha: SENHA } },
];

function requisicao(caso: Caso, opcoes: { corpoCru?: string; comCookie?: boolean } = {}): Request {
  const headers = new Headers({ 'x-pelada': '1', 'cf-connecting-ip': '203.0.113.9' });
  if (opcoes.comCookie !== false) headers.set('cookie', `__Host-sessao=${TOKEN}`);
  let body: string | undefined;
  if (opcoes.corpoCru !== undefined) body = opcoes.corpoCru;
  else if (caso.corpo !== undefined) body = JSON.stringify(caso.corpo);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://pelada.exemplo.test${caso.caminho}`, {
    method: caso.metodo,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
}

const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ACE-53: Cache-Control no-store nas rotas de acesso', () => {
  const app = criarApp();

  it.each(ROTAS)('$metodo $caminho: no-store com o banco fora (sem cookie)', async (caso) => {
    const r = await app.fetch(requisicao(caso, { comCookie: false }), env(), ctx as never);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it.each(ROTAS)('$metodo $caminho: no-store com o banco fora (com cookie)', async (caso) => {
    const r = await app.fetch(requisicao(caso), env(), ctx as never);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it.each(ROTAS.filter((c) => c.metodo === 'POST'))(
    '$caminho: no-store no 422 de corpo inválido',
    async (caso) => {
      const r = await app.fetch(
        requisicao(caso, { corpoCru: '{nao json', comCookie: false }),
        env(),
        ctx as never,
      );
      expect(r.headers.get('cache-control')).toBe('no-store');
    },
  );

  it.each(ROTAS)(
    '$metodo $caminho: no-store no 429 do limitador e no 500 forçado',
    async (caso) => {
      const negado = await app.fetch(
        requisicao(caso, { comCookie: false }),
        env({ LIMITE_ENTRAR: nega, LIMITE_ESCRITA: nega, LIMITE_PUBLICO: nega }),
        ctx as never,
      );
      expect(negado.headers.get('cache-control')).toBe('no-store');
      const erro = await app.fetch(
        requisicao(caso),
        env({ HYPERDRIVE: hyperdriveQueLanca } as Partial<Env>),
        ctx as never,
      );
      expect(erro.headers.get('cache-control')).toBe('no-store');
    },
  );
});

/** Captura todas as linhas de log do console durante `fn`. */
async function capturarLogs(fn: () => Promise<void>): Promise<string[]> {
  const linhas: string[] = [];
  const guardar = (...args: unknown[]) => {
    linhas.push(
      args.map((a) => (typeof a === 'string' ? a : (JSON.stringify(a) ?? String(a)))).join(' '),
    );
  };
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation(guardar);
  }
  await fn();
  return linhas;
}

describe('ACE-21: nada de senha, token ou corpo no log', () => {
  it('nenhuma linha de log contém a senha nem o token, com o banco fora (503)', async () => {
    const app = criarApp();
    const linhas = await capturarLogs(async () => {
      for (const caso of ROTAS) await app.fetch(requisicao(caso), env(), ctx as never);
    });
    for (const linha of linhas) for (const m of MARCADORES) expect(linha).not.toContain(m);
  });

  it('nenhuma linha de log contém a senha nem o token, com erro 500 forçado', async () => {
    const app = criarApp();
    const linhas = await capturarLogs(async () => {
      for (const caso of ROTAS) {
        const r = await app.fetch(
          requisicao(caso),
          env({ HYPERDRIVE: hyperdriveQueLanca } as Partial<Env>),
          ctx as never,
        );
        expect(r.status).toBe(500);
        const corpo = await r.text();
        for (const m of MARCADORES) expect(corpo).not.toContain(m);
      }
    });
    for (const linha of linhas) for (const m of MARCADORES) expect(linha).not.toContain(m);
  });

  it('o evento do Sentry da requisição, depois do beforeSend configurado, não contém a senha, o token nem o corpo', async () => {
    const app = criarApp();
    const eventos: string[] = [];
    // `withSentry` falso: monta o evento como o SDK faria com a requisição (url, cabeçalhos,
    // cookies e corpo) e o passa pelo `beforeSend` das opções do Worker.
    const embrulhar: EmbrulharSentry = (opcoes, manipulador) => ({
      fetch: async (r, e, c) => {
        const corpo = await r.clone().text();
        const resposta = await manipulador.fetch(r, e, c);
        const evento = {
          message: 'Erro interno.',
          request: {
            url: r.url,
            method: r.method,
            headers: Object.fromEntries(r.headers.entries()),
            cookies: { '__Host-sessao': TOKEN },
            data: corpo,
          },
          extra: { status: resposta.status },
        };
        eventos.push(JSON.stringify(opcoes(e).beforeSend(evento)));
        return resposta;
      },
    });
    const manipulador: Manipulador = { fetch: (r, e, c) => app.fetch(r, e, c as never) };
    const w = criarWorker(manipulador, embrulhar);
    for (const caso of ROTAS) {
      await w.fetch(
        requisicao(caso),
        env({
          SENTRY_DSN: 'https://chave@sentry.exemplo.test/1',
          HYPERDRIVE: hyperdriveQueLanca,
        } as Partial<Env>),
        ctx,
      );
    }
    expect(eventos).toHaveLength(ROTAS.length);
    for (const evento of eventos) for (const m of MARCADORES) expect(evento).not.toContain(m);
  });
});
