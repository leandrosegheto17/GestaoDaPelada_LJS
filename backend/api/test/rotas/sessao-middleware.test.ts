import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import type { Limitador } from '../../src/entrada/middlewares/limite-taxa.ts';
import { exigirSessao } from '../../src/entrada/middlewares/sessao.ts';
import * as sessoes from '../../src/infraestrutura/db/repositorios/sessoes.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';
import { criarSessao, noBanco } from '../apoio/sessao-worker.ts';

// Middlewares de sessão e ordem da entrada (design C3, AD-007; ACE-15, ACE-16, ACE-47, ACE-49, ACE-50, ACE-53).

function limitadorDe(limite: number): Limitador & { chaves: string[] } {
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      return { success: chaves.length <= limite };
    },
  };
}

/** Rotas de prova: uma protegida por `exigirSessao`, que conta o estado da transação da rota na 1ª consulta. */
function rotasDeProva(app: Hono<AppEnv>): void {
  const estado = async (db: AppEnv['Variables']['db']) => {
    const { rows } = await sql<{ usuario: string; conta: string; somente_leitura: string }>`
      SELECT current_user AS usuario, current_setting('app.conta_id', true) AS conta,
             current_setting('transaction_read_only') AS somente_leitura
    `.execute(db);
    return rows[0];
  };
  app.get('/api/teste/protegida', exigirSessao, async (c) => c.json(await estado(c.var.db)));
  app.post('/api/teste/protegida', exigirSessao, async (c) => c.json(await estado(c.var.db)));
  app.get('/api/teste/aberta', async (c) => c.json({ conta: c.get('contaId') ?? null }));
}

const comProva = { preparar: rotasDeProva };

/** Env que conta quantas vezes o binding do banco é lido. */
function espiaoDoBanco(): { env: typeof env; acessos: () => number } {
  let acessos = 0;
  const espiao = new Proxy(env, {
    get(alvo, prop, receptor) {
      if (prop === 'HYPERDRIVE') acessos++;
      return Reflect.get(alvo, prop, receptor);
    },
  });
  return { env: espiao, acessos: () => acessos };
}

const ROTAS_SEM_SESSAO = [
  '/api/conta',
  '/api/conta/confirmar',
  '/api/conta/reenviar-confirmacao',
  '/api/sessao/entrar',
  '/api/sessao/esqueci-senha',
  '/api/sessao/nova-senha',
  '/api/convites/ler',
  '/api/convites/cadastrar',
  // ACE-70 (T60): as rotas com senha atual também passam pelo limitador por IP, antes do bcrypt.
  '/api/conta/senha',
  '/api/conta/excluir',
];

describe('CSRF antes dos limitadores (ACE-49, SEC-005)', () => {
  it('11 POST sem X-Pelada seguidos de 1 com o cabeçalho: o último não recebe 429', async () => {
    const entrar = limitadorDe(10);
    const opcoes = { app: { limitadores: { entrar } } };
    for (let i = 0; i < 11; i++) {
      const r = await chamar('/api/sessao/entrar', { method: 'POST' }, opcoes);
      expect(r.status).toBe(403);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'requisicao_recusada' } });
    }
    const ultimo = await chamar('/api/sessao/entrar', { method: 'POST', headers: { 'X-Pelada': '1' } }, opcoes);
    expect(ultimo.status).not.toBe(429);
    expect(entrar.chaves).toHaveLength(1);
  });
});

describe('LIMITE_ENTRAR nas rotas sem sessão da tabela do C4 (ACE-50)', () => {
  it.each(ROTAS_SEM_SESSAO)('POST %s passa pelo LIMITE_ENTRAR: esgotado, 429', async (caminho) => {
    const entrar = limitadorDe(0);
    const r = await chamar(
      caminho,
      { method: 'POST', headers: { 'X-Pelada': '1' } },
      { app: { limitadores: { entrar } } },
    );
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'muitas_requisicoes' } });
    expect(entrar.chaves).toHaveLength(1);
  });

  it.each(['/api/conta/senha', '/api/conta/excluir'])(
    'POST %s esgotado: 429 sem tocar no banco (nem sessão nem bcrypt rodam)',
    async (caminho) => {
      const sonda = espiaoDoBanco();
      const entrar = limitadorDe(0);
      const corpo = JSON.stringify({ senhaAtual: 'qualquer-senha-1', novaSenha: 'outra-senha-123' });
      const r = await chamar(
        caminho,
        { method: 'POST', headers: { 'X-Pelada': '1', 'Content-Type': 'application/json' }, body: corpo },
        { env: sonda.env, app: { limitadores: { entrar } } },
      );
      expect(r.status).toBe(429);
      expect(sonda.acessos()).toBe(0);
    },
  );

  it.each([
    ['GET', '/api/sessao'],
    ['POST', '/api/sessao/sair'],
    ['POST', '/api/convites/aceitar'],
  ])('%s %s (com sessão) não passa pelo LIMITE_ENTRAR', async (method, caminho) => {
    const entrar = limitadorDe(0);
    const r = await chamar(caminho, { method, headers: { 'X-Pelada': '1' } }, { app: { limitadores: { entrar } } });
    expect(r.status).not.toBe(429);
    expect(entrar.chaves).toEqual([]);
  });
});

describe('carregarSessao e exigirSessao', () => {
  it('cookie válido num GET: a 1ª consulta da rota já tem app.conta_id da sessão e roda em READ ONLY (ACE-47)', async () => {
    const s = await criarSessao();
    const r = await chamar('/api/teste/protegida', { headers: { Cookie: s.cookie } }, comProva);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ usuario: 'pelada_app', conta: s.contaId, somente_leitura: 'on' });
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });

  it('cookie válido num POST: a transação da rota é de escrita e já tem app.conta_id (ACE-47)', async () => {
    const s = await criarSessao();
    const r = await chamar(
      '/api/teste/protegida',
      { method: 'POST', headers: { Cookie: s.cookie, 'X-Pelada': '1' } },
      comProva,
    );
    expect(r.corpo).toEqual({ usuario: 'pelada_app', conta: s.contaId, somente_leitura: 'off' });
  });

  it('a sessão é renovada numa transação própria, mesmo quando a rota é READ ONLY (AD-007)', async () => {
    const s = await criarSessao();
    const antes = await noBanco(
      s.contaId,
      async (db) =>
        (await db.selectFrom('sessoes').select('ultimo_uso_em').where('token_hash', '=', s.hash).executeTakeFirst())
          ?.ultimo_uso_em,
    );
    await new Promise((ok) => setTimeout(ok, 20));
    expect((await chamar('/api/teste/protegida', { headers: { Cookie: s.cookie } }, comProva)).status).toBe(200);
    const depois = await noBanco(
      s.contaId,
      async (db) =>
        (await db.selectFrom('sessoes').select('ultimo_uso_em').where('token_hash', '=', s.hash).executeTakeFirst())
          ?.ultimo_uso_em,
    );
    expect(depois?.getTime()).toBeGreaterThan(antes?.getTime() ?? Infinity);
  });

  it('sem cookie: 401 sessao_expirada no formato padrão, sem cache, e o banco nem é lido', async () => {
    const espiao = espiaoDoBanco();
    const r = await chamar('/api/teste/protegida', {}, { ...comProva, env: espiao.env });
    expect(r.status).toBe(401);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(espiao.acessos()).toBe(0);
  });

  // O banco decide os 15 min de inatividade e as 12 h (`sessao_tocar`, provado em test/repositorios/sessoes.test.ts
  // e test/migracoes/conta-entrar-e-sessao.test.ts): a sessão vencida é apagada e a função devolve nulo. O Worker de
  // teste não tem o owner para envelhecer a linha; aqui a sessão é apagada, que é o estado em que a vencida fica.
  it('sessão vencida (o banco não a aceita mais): 401 sessao_expirada e o cookie é limpo (ACE-15, ACE-16)', async () => {
    const s = await criarSessao();
    await noBanco(s.contaId, (db) => sessoes.encerrarAtual(db, s.hash));
    const r = await chamar('/api/teste/protegida', { headers: { Cookie: s.cookie } }, comProva);
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const cookie = r.headers.get('Set-Cookie') ?? '';
    expect(cookie.startsWith('__Host-sessao=;')).toBe(true);
    expect(cookie).toContain('Max-Age=0');
  });

  it('sessão vencida numa rota sem exigência: segue sem conta e limpa o cookie', async () => {
    const s = await criarSessao();
    await noBanco(s.contaId, (db) => sessoes.encerrarAtual(db, s.hash));
    const r = await chamar('/api/teste/aberta', { headers: { Cookie: s.cookie } }, comProva);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ conta: null });
    expect(r.headers.get('Set-Cookie') ?? '').toContain('Max-Age=0');
  });

  it('cookie com formato inválido: segue sem conta, sem tocar o banco', async () => {
    const espiao = espiaoDoBanco();
    const r = await chamar(
      '/api/teste/protegida',
      { headers: { Cookie: '__Host-sessao=curto' } },
      { ...comProva, env: espiao.env },
    );
    expect(r.status).toBe(401);
    expect(espiao.acessos()).toBe(0);
  });
});

describe('a sessão só é resolvida depois do CSRF e dos limitadores (ordem do C3)', () => {
  it('escrita sem X-Pelada, com cookie: 403 e o banco nem é lido', async () => {
    const s = await criarSessao();
    const espiao = espiaoDoBanco();
    const r = await chamar(
      '/api/teste/protegida',
      { method: 'POST', headers: { Cookie: s.cookie } },
      { ...comProva, env: espiao.env },
    );
    expect(r.status).toBe(403);
    expect(espiao.acessos()).toBe(0);
  });

  it('limite estourado, com cookie: 429 e o banco nem é lido', async () => {
    const s = await criarSessao();
    const espiao = espiaoDoBanco();
    const r = await chamar(
      '/api/sessao/entrar',
      { method: 'POST', headers: { Cookie: s.cookie, 'X-Pelada': '1' } },
      { env: espiao.env, app: { limitadores: { entrar: limitadorDe(0) } } },
    );
    expect(r.status).toBe(429);
    expect(espiao.acessos()).toBe(0);
  });
});
