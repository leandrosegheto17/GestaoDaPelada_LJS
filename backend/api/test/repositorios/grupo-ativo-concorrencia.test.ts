import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import { exigirGrupoAtivo } from '../../src/entrada/middlewares/grupo-ativo.ts';
import { abrirTransacaoDaRequisicao, type Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as jogadores from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Corrida entre o exigirGrupoAtivo e o arquivamento (T79; SEC-007). A escrita é uma requisição de verdade: o
// middleware roda na transação dela (como pelada_app, sob a RLS) e a rota só grava depois de um sinal. Enquanto a rota
// espera, a criadora arquiva o grupo noutra conexão. Com a leitura travada (FOR KEY SHARE), o arquivar espera a escrita
// terminar; sem a trava, ele confirmaria antes e a escrita gravaria no grupo já arquivado.

const HOJE = '2026-10-30';
const DADOS_GRUPO = { nome: 'Pelada Corrida', diaSemana: 'quarta', frequencia: 'semanal', horario: '20:00' } as const;
const ESPERA_MS = 500;

let b: BancoDeRepositorio;
let conta: string;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
  conta = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [conta, `${conta}@exemplo.com`],
  );
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(acao: (db: Db) => Promise<T>) => comDb(b.urlApp, { conta }, acao);

/** Promessa com o `resolve` por fora. */
function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar = () => undefined as void;
  const promessa = new Promise<void>((r) => {
    disparar = r;
  });
  return { promessa, disparar };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * App com a transação da requisição (como o `comBanco`, sobre a URL da pelada_app), o `exigirGrupoAtivo` e uma rota que
 * avisa que passou pelo middleware, espera `liberar` e então edita o jogador.
 */
function appDaEscrita(passou: () => void, liberar: Promise<void>) {
  const app = new Hono<AppEnv>();
  app.use('/api/grupos/:grupoId/*', async (c, proximo) => {
    const t = abrirTransacaoDaRequisicao({
      connectionString: () => b.urlApp,
      somenteLeitura: false,
      contexto: () => ({ contaId: conta }),
    });
    c.set('db', t.db);
    try {
      await proximo();
      await t.terminar(c.res.status < 400 && !c.error);
    } catch (erro) {
      await t.terminar(false).catch(() => undefined);
      throw erro;
    } finally {
      await t.fechar();
    }
  });
  app.use('/api/grupos/:grupoId/*', exigirGrupoAtivo);
  app.patch('/api/grupos/:grupoId/prova-grupo', async (c) => {
    passou();
    await liberar;
    const nome = c.req.query('nome') ?? 'Sem Nome';
    return c.json({ ok: await grupos.editar(c.var.db, c.req.param('grupoId'), { ...DADOS_GRUPO, nome }) });
  });
  app.patch('/api/grupos/:grupoId/jogadores/:id', async (c) => {
    passou();
    await liberar;
    const r = await jogadores.editar(c.var.db, c.req.param('grupoId'), c.req.param('id'), {
      apelido: 'Gravado Na Corrida',
      anoNascimento: 1990,
      posicao: 'meia',
      telefone: null,
    });
    return c.json({ ok: r?.ok ?? false });
  });
  return app;
}

describe('exigirGrupoAtivo × arquivar (SEC-007)', () => {
  it('a leitura do grupo trava a linha: o arquivar espera a escrita em curso terminar', async () => {
    const g = await como((db) => grupos.criar(db, DADOS_GRUPO, `corrida-${randomUUID().slice(0, 8)}`));
    const criado = await como((db) =>
      jogadores.criar(
        db,
        g.id,
        { apelido: 'Antes', anoNascimento: 1990, posicao: 'meia', telefone: null, pontuacaoInicial: 0 },
        HOJE,
      ),
    );
    if (!criado.ok) throw new Error('criar jogador');

    const passou = sinal();
    const liberar = sinal();
    const app = appDaEscrita(passou.disparar, liberar.promessa);
    const escrita = app.request(`/api/grupos/${g.id}/jogadores/${criado.id}`, { method: 'PATCH' });
    await passou.promessa;

    // A escrita já passou pelo middleware (grupo ativo) e ainda não confirmou. O arquivar começa agora.
    let arquivou = false;
    const arquivar = como((db) => grupos.arquivar(db, g.id, DADOS_GRUPO.nome)).then((r) => {
      arquivou = true;
      return r;
    });
    await esperar(ESPERA_MS);
    // Com a trava, o arquivar ainda espera (FOR UPDATE contra o FOR KEY SHARE da escrita).
    expect(arquivou).toBe(false);

    liberar.disparar();
    const resposta = await escrita;
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true });
    expect(await arquivar).toBe('ok');
    // Liberada a escrita, o arquivamento confirma depois dela: a escrita gravou com o grupo ainda ativo.
    expect(arquivou).toBe(true);

    const { rows } = await b.owner.query<{ apelido: string; arquivado: boolean }>(
      `SELECT j.apelido, g.arquivado_em IS NOT NULL AS arquivado
         FROM jogadores j JOIN grupos g ON g.id = j.grupo_id WHERE j.id = $1`,
      [criado.id],
    );
    expect(rows).toEqual([{ apelido: 'Gravado Na Corrida', arquivado: true }]);
  });

  it('arquivado antes da escrita chegar: 409 e nada gravado (o arquivar confirmado é visto)', async () => {
    const g = await como((db) => grupos.criar(db, DADOS_GRUPO, `corrida-${randomUUID().slice(0, 8)}`));
    const criado = await como((db) =>
      jogadores.criar(
        db,
        g.id,
        { apelido: 'Antes', anoNascimento: 1990, posicao: 'meia', telefone: null, pontuacaoInicial: 0 },
        HOJE,
      ),
    );
    if (!criado.ok) throw new Error('criar jogador');
    expect(await como((db) => grupos.arquivar(db, g.id, DADOS_GRUPO.nome))).toBe('ok');

    const liberado = Promise.resolve();
    const r = await appDaEscrita(() => undefined, liberado).request(`/api/grupos/${g.id}/jogadores/${criado.id}`, {
      method: 'PATCH',
    });
    expect(r.status).toBe(409);
    const { rows } = await b.owner.query('SELECT apelido FROM jogadores WHERE id = $1', [criado.id]);
    expect(rows).toEqual([{ apelido: 'Antes' }]);
  });

  it('duas escritas simultâneas que alteram o próprio grupo não se travam (sem deadlock)', async () => {
    const g = await como((db) => grupos.criar(db, DADOS_GRUPO, `corrida-${randomUUID().slice(0, 8)}`));
    let passaram = 0;
    const ambasPassaram = sinal();
    const liberar = sinal();
    const app = appDaEscrita(() => {
      passaram += 1;
      if (passaram === 2) ambasPassaram.disparar();
    }, liberar.promessa);
    const pedir = (nome: string) =>
      app.request(`/api/grupos/${g.id}/prova-grupo?nome=${encodeURIComponent(nome)}`, { method: 'PATCH' });
    const primeira = pedir('Nome Um');
    const segunda = pedir('Nome Dois');
    // As duas passaram pelo middleware (com a trava de leitura) antes de qualquer uma alterar o grupo.
    await ambasPassaram.promessa;
    liberar.disparar();
    const respostas = await Promise.all([primeira, segunda]);
    expect(respostas.map((r) => r.status)).toEqual([200, 200]);
    const { rows } = await b.owner.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [g.id]);
    expect(['Nome Um', 'Nome Dois']).toContain(rows[0]?.nome);
  });
});
