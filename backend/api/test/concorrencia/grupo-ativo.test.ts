import { Buffer } from 'node:buffer';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { comoAppAqui, outraConexao } from '../banco/apoio-conta.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Corrida entre a escrita no grupo e o arquivamento (T25; SEC-007). A escrita é uma requisição de verdade pelo
 * `criarApp`: a cadeia das rotas de grupo (sessão, transação como `pelada_app`, vínculo e `exigirGrupoAtivo`) roda na
 * transação dela, e a rota de teste avisa que passou pela cadeia e só grava depois de um sinal. O arquivamento roda
 * noutra conexão, como `pelada_app` em nome da criadora, do jeito que o `grupos.arquivar` faz (T27, `GD:150`): trava a
 * linha do grupo com `FOR UPDATE` e grava `arquivado_em`. O `UPDATE` sozinho pegaria `FOR NO KEY UPDATE`, que não
 * espera o `FOR KEY SHARE`; por isso o arquivar trava antes.
 *
 * Casos limite (Domínio: sim), listados antes do teste:
 * - escrita aberta (já viu o grupo ativo) e arquivar em seguida: o arquivar espera a escrita confirmar; a escrita grava
 *   e responde 200; depois o grupo fica arquivado;
 * - arquivar aberto (linha travada, `arquivado_em` gravado, sem confirmar) e escrita em seguida: o `exigirGrupoAtivo`
 *   espera na trava, lê a versão confirmada (arquivado) e responde 409 `grupo_arquivado`, sem chamar a rota;
 * - dois PATCH do mesmo grupo: os dois passam pela leitura travada; o primeiro `UPDATE` não espera o `FOR KEY SHARE`
 *   do segundo, e o segundo espera o primeiro confirmar. Sem deadlock (com `FOR SHARE`, os dois `UPDATE` esperariam
 *   um ao outro e o Postgres derrubaria um com 40P01, `GSEG:163`).
 *
 * Evidência da rede (registrar na T25): trocar `FOR KEY SHARE` por nada no `exigirGrupoAtivo` deixa o primeiro teste
 * vermelho (o arquivar não espera); trocar por `FOR SHARE` deixa o terceiro vermelho (deadlock, 500).
 */

let aberto: CenarioGruposAberto;

const PRAZO_MS = 5000;

/** Promessa com o `resolve` por fora. */
function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar: () => void = () => undefined;
  const promessa = new Promise<void>((ok) => {
    disparar = ok;
  });
  return { promessa, disparar };
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

interface Escrita {
  passou: ReturnType<typeof sinal>;
  liberar: ReturnType<typeof sinal>;
  nome: string;
}

/** Escritas em curso, pela chave do cabeçalho `x-teste-escrita`. */
const escritas = new Map<string, Escrita>();
let chamadasDaRota = 0;

function novaEscrita(chave: string, nome: string): Escrita {
  const e = { passou: sinal(), liberar: sinal(), nome };
  escritas.set(chave, e);
  return e;
}

/**
 * O app real, com uma rota de teste que faz o que o PATCH do grupo faz (`UPDATE grupos SET nome`), esperando o sinal
 * entre a cadeia e o `UPDATE`. Caminho próprio, para não colidir com o `PATCH /api/grupos/:grupoId` real (T29).
 */
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  registrarExtras: (api) => {
    api.patch('/grupos/:grupoId/teste-corrida', async (c) => {
      chamadasDaRota += 1;
      const e = escritas.get(c.req.header('x-teste-escrita') ?? '');
      if (!e) return c.json({ erro: 'escrita sem chave' }, 500);
      e.passou.disparar();
      await e.liberar.promessa;
      await c.var.db
        .updateTable('grupos')
        .set({ nome: e.nome })
        .where('id', '=', c.req.param('grupoId'))
        .execute();
      return c.json({ ok: true }, 200);
    });
  },
});

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function patch(grupo: string, token: string, chave: string): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'x-teste-escrita': chave,
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${token}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${grupo}/teste-corrida`,
    { method: 'PATCH', headers, body: '{}' },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function pidDe(c: pg.Client): Promise<number> {
  const r = await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return r.rows[0]?.pid ?? -1;
}

/** A conexão de `pid` está parada numa trava. */
async function estaNaTrava(pid: number): Promise<boolean> {
  const r = await aberto.db.query<{ esperando: boolean }>(
    `SELECT wait_event_type = 'Lock' AS esperando FROM pg_stat_activity WHERE pid = $1`,
    [pid],
  );
  return r.rows[0]?.esperando === true;
}

/** Espera até alguma conexão deste banco, fora de `exceto`, estar parada numa trava. */
async function esperarAlguemNaTrava(exceto: number[]): Promise<void> {
  const limite = Date.now() + PRAZO_MS;
  while (Date.now() < limite) {
    const r = await aberto.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND NOT (pid = ANY($1::int[]))`,
      [exceto],
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await esperar(20);
  }
  throw new Error(`Nenhuma conexão esperou na trava em ${PRAZO_MS} ms`);
}

/** Espera `p` com prazo; estourado, rejeita. */
async function comPrazo<T>(p: Promise<T>, o_que: string): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, falha) => {
    relogio = setTimeout(() => falha(new Error(`${o_que}: passou de ${PRAZO_MS} ms`)), PRAZO_MS);
  });
  try {
    return await Promise.race([p, prazo]);
  } finally {
    clearTimeout(relogio);
  }
}

async function nomeDe(grupo: string): Promise<string | undefined> {
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [
    grupo,
  ]);
  return r.rows[0]?.nome;
}

async function arquivadoEm(grupo: string): Promise<Date | null | undefined> {
  const r = await aberto.db.query<{ arquivado_em: Date | null }>(
    'SELECT arquivado_em FROM grupos WHERE id = $1',
    [grupo],
  );
  return r.rows[0]?.arquivado_em;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  escritas.clear();
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('SEC-007: escrita em curso e arquivamento', () => {
  it('SEC-007: o UPDATE de arquivado_em espera o fim da transação da escrita que viu o grupo ativo', async () => {
    const { url, cenario } = aberto;
    const ordem: string[] = [];
    const e = novaEscrita('um', 'Nome da Escrita em Curso');
    const arquivador = await outraConexao(url);
    try {
      const resposta = patch(cenario.grupoG, await sessao(cenario.contaO), 'um').then((r) => {
        ordem.push('escrita confirmou');
        return r;
      });
      await comPrazo(e.passou.promessa, 'a escrita passar pela cadeia');

      await arquivador.query('BEGIN');
      await comoAppAqui(arquivador, cenario.contaC);
      const pidArquivador = await pidDe(arquivador);
      const travou = arquivador
        .query('SELECT id FROM grupos WHERE id = $1 FOR UPDATE', [cenario.grupoG])
        .then((r) => {
          ordem.push('arquivar travou a linha');
          return r;
        });

      // Sem o FOR KEY SHARE da escrita, o FOR UPDATE não esperaria e este laço estouraria o prazo.
      const limite = Date.now() + PRAZO_MS;
      while (!(await estaNaTrava(pidArquivador))) {
        if (Date.now() > limite) throw new Error('O arquivar não esperou a escrita em curso');
        await esperar(20);
      }
      expect(ordem).toEqual([]);

      e.liberar.disparar();
      const r = await comPrazo(resposta, 'a escrita responder');
      await comPrazo(travou, 'o arquivar travar a linha');
      await arquivador.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [
        cenario.grupoG,
      ]);
      await arquivador.query('COMMIT');

      expect(r.status).toBe(200);
      expect(ordem).toEqual(['escrita confirmou', 'arquivar travou a linha']);
      expect(await nomeDe(cenario.grupoG)).toBe('Nome da Escrita em Curso');
      expect(await arquivadoEm(cenario.grupoG)).not.toBeNull();
    } finally {
      e.liberar.disparar();
      await arquivador.query('ROLLBACK').catch(() => undefined);
      await arquivador.end();
    }
  });

  it('SEC-007: com o arquivar aberto, a escrita seguinte espera e recebe 409 grupo_arquivado, sem chamar a rota', async () => {
    const { url, cenario } = aberto;
    const nomeAntes = await nomeDe(cenario.grupoG);
    const e = novaEscrita('dois', 'Nome que não pode ser gravado');
    e.liberar.disparar();
    const arquivador = await outraConexao(url);
    try {
      await arquivador.query('BEGIN');
      await comoAppAqui(arquivador, cenario.contaC);
      const pidArquivador = await pidDe(arquivador);
      await arquivador.query('SELECT id FROM grupos WHERE id = $1 FOR UPDATE', [cenario.grupoG]);
      await arquivador.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [
        cenario.grupoG,
      ]);

      const antes = chamadasDaRota;
      const resposta = patch(cenario.grupoG, await sessao(cenario.contaC), 'dois');
      // A leitura travada da escrita espera o arquivar (a do vínculo, sem trava, não espera).
      await esperarAlguemNaTrava([pidArquivador]);

      await arquivador.query('COMMIT');
      const r = await comPrazo(resposta, 'a escrita responder');
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
      expect(chamadasDaRota).toBe(antes);
      expect(await nomeDe(cenario.grupoG)).toBe(nomeAntes);
    } finally {
      await arquivador.query('ROLLBACK').catch(() => undefined);
      await arquivador.end();
    }
  });
});

describe('SEC-007: dois PATCH simultâneos do mesmo grupo', () => {
  it('SEC-007: os dois terminam com 200, sem deadlock, e vale o último a gravar', async () => {
    const { cenario } = aberto;
    const um = novaEscrita('p1', 'Nome do Primeiro PATCH');
    const dois = novaEscrita('p2', 'Nome do Segundo PATCH');
    try {
      const r1 = patch(cenario.grupoG, await sessao(cenario.contaC), 'p1');
      const r2 = patch(cenario.grupoG, await sessao(cenario.contaO), 'p2');
      // Os dois já leram o grupo ativo com FOR KEY SHARE, e as duas transações estão abertas.
      await comPrazo(
        Promise.all([um.passou.promessa, dois.passou.promessa]),
        'os dois PATCH passarem pela cadeia',
      );

      um.liberar.disparar();
      // Com FOR KEY SHARE o primeiro grava sem esperar o segundo; com FOR SHARE ficaria parado aqui.
      await Promise.race([r1, esperar(500)]);
      dois.liberar.disparar();

      const [s1, s2] = await comPrazo(Promise.all([r1, r2]), 'os dois PATCH responderem');
      expect(s1.status).toBe(200);
      expect(s2.status).toBe(200);
      expect(await nomeDe(cenario.grupoG)).toBe('Nome do Segundo PATCH');
    } finally {
      um.liberar.disparar();
      dois.liberar.disparar();
    }
  });
});
