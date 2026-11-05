import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp, type OpcoesApp } from '../../src/entrada/app.ts';
import { MENSAGEM_PLANO_PRO, recursoLiberadoPeloPlano, type RecursoLiberado } from '../../src/entrada/middlewares/recurso.ts';
import { relogioDoSistema } from '../../src/infraestrutura/relogio.ts';
import { comDb } from '../repositorios/apoio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Recurso `financeiro` no ponto único de trava de plano (T24; FIN-45, FIN-50; AD-049, AD-074, AD-077), com o app real
 * como `pelada_app` e a criadora C de G (com acesso). A trava é forçada em "somente leitura" pela injeção
 * `criarApp({ recursoLiberado })` da simulador. Rotas de teste em `…/financeiro/teste` mostram se a cadeia deixou
 * passar. A prova sobre as rotas reais do financeiro é da T32.
 *
 * Casos limite: padrão libera; negado em cada escrita (403) e em GET e HEAD (passa, sem consultar); a ordem
 * `exigirFinanceiro` (403 sem permissão) antes da trava de plano; a trava recebe o grupo e o recurso `financeiro`.
 */

const ESCRITAS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

let aberto: CenarioGruposAberto;
let chamadas = 0;
const pedidosDaTrava: Array<{ grupoId: string; recurso: string }> = [];

const somenteLeitura: RecursoLiberado = async (_db, grupoId, recurso) => {
  pedidosDaTrava.push({ grupoId, recurso });
  return recurso !== 'financeiro';
};

function montar(opcoes: Pick<OpcoesApp, 'recursoLiberado'> = {}) {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    ...opcoes,
    registrarExtras: (api) => {
      api.on(['GET', 'HEAD', ...ESCRITAS], '/grupos/:grupoId/financeiro/teste', (c) => {
        chamadas += 1;
        return c.json({ ok: true }, 200);
      });
    },
  });
}

async function pedir(app: ReturnType<typeof criarApp>, conta: string, metodo: string): Promise<Response> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${token}` });
  const comCorpo = metodo !== 'GET' && metodo !== 'HEAD';
  if (comCorpo) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/financeiro/teste`,
    { method: metodo, headers, ...(comCorpo ? { body: '{}' } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('recurso financeiro no ponto único (FIN-45)', () => {
  // Trocado pela T21 da planos-e-cobranca (autorizado em `## Autorizações` do STATE.md): o padrão passou a ler o plano
  // no banco, então "sem consultar o banco" deixou de valer por desenho. Mesma força: G e H em Pro (trial recém criado
  // pelo cenário) têm o financeiro; G em `inadimplente` não.
  it('FIN-45: com o plano em Pro (trial do cenário), G e H têm o financeiro liberado', async () => {
    const { cenario } = aberto;
    const pontoUnico = recursoLiberadoPeloPlano(relogioDoSistema());
    expect(await comDb(aberto.url, cenario.contaC, (db) => pontoUnico(db, cenario.grupoG, 'financeiro'))).toBe(true);
    expect(await comDb(aberto.url, cenario.contaB, (db) => pontoUnico(db, cenario.grupoH, 'financeiro'))).toBe(true);
  });

  it('FIN-45: com G em inadimplente, o padrão nega o financeiro de G', async () => {
    const { db, cenario } = aberto;
    const antes = await db.query<{ s: string; t: string | null }>(
      'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
      [cenario.grupoG],
    );
    await db.query(`UPDATE grupos SET situacao_comercial = 'inadimplente', trial_inicio = NULL WHERE id = $1`, [
      cenario.grupoG,
    ]);
    try {
      const pontoUnico = recursoLiberadoPeloPlano(relogioDoSistema());
      expect(await comDb(aberto.url, cenario.contaC, (d) => pontoUnico(d, cenario.grupoG, 'financeiro'))).toBe(false);
    } finally {
      await db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1', [
        cenario.grupoG,
        antes.rows[0]?.s,
        antes.rows[0]?.t ?? null,
      ]);
    }
  });

  it.each(['GET', ...ESCRITAS])('FIN-45: com o padrão, %s passa', async (metodo) => {
    const antes = chamadas;
    const r = await pedir(montar(), aberto.cenario.contaC, metodo);
    expect(r.status).toBe(200);
    expect(chamadas).toBe(antes + 1);
  });

  it('FIN-45: as rotas e o middleware do financeiro não leem situacao_comercial (a decisão é só do ponto único)', () => {
    const raiz = join(import.meta.dirname, '../../src/entrada');
    const arquivos = [
      ...readdirSync(join(raiz, 'rotas')).filter((f) => f.startsWith('financeiro')).map((f) => join(raiz, 'rotas', f)),
      join(raiz, 'middlewares', 'financeiro.ts'),
    ];
    const comLeitura = arquivos.filter((f) => readFileSync(f, 'utf8').includes('situacao_comercial'));
    expect(comLeitura).toEqual([]);
  });
});

describe('ponto em "somente leitura" (FIN-50)', () => {
  it.each(ESCRITAS)('FIN-50: %s responde 403 plano_pro com o recurso financeiro, sem chamar a rota', async (metodo) => {
    const antes = chamadas;
    const r = await pedir(montar({ recursoLiberado: somenteLeitura }), aberto.cenario.contaC, metodo);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ erro: 'plano_pro', recurso: 'financeiro', mensagem: MENSAGEM_PLANO_PRO });
    expect(chamadas).toBe(antes);
  });

  it.each(['GET', 'HEAD'])('FIN-50: %s passa sem consultar a trava', async (metodo) => {
    pedidosDaTrava.length = 0;
    const r = await pedir(montar({ recursoLiberado: somenteLeitura }), aberto.cenario.contaC, metodo);
    expect(r.status).toBe(200);
    expect(pedidosDaTrava).toEqual([]);
  });

  it('FIN-50: a trava recebe o grupo da URL e o recurso financeiro', async () => {
    pedidosDaTrava.length = 0;
    await pedir(montar({ recursoLiberado: somenteLeitura }), aberto.cenario.contaC, 'POST');
    expect(pedidosDaTrava).toEqual([{ grupoId: aberto.cenario.grupoG, recurso: 'financeiro' }]);
  });

  it('FIN-33, AD-077: admin sem acesso recebe 403 sem_permissao_financeiro antes da trava de plano', async () => {
    pedidosDaTrava.length = 0;
    const r = await pedir(montar({ recursoLiberado: somenteLeitura }), aberto.cenario.contaO, 'POST');
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });
    expect(pedidosDaTrava).toEqual([]);
  });
});
