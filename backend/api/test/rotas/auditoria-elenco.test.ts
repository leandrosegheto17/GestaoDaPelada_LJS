import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Auditoria sem dado pessoal (T49; GEL-113). Passa por todas as escritas do jogador pelas rotas reais, como
 * `pelada_app` e com o relógio fixo em 05/11/2026: criar com o telefone `11987654321` e o ano 1987 (os marcadores),
 * editar para outros valores e de volta aos marcadores, inativar, reativar, corrigir a saída, alterar o início e
 * excluir. Depois lê como superusuário as linhas de `auditoria` do jogador (todas as colunas, menos o `momento`, cujos
 * microssegundos podiam conter o ano por acaso) e confere que nenhuma tem os marcadores e que o `resumo` tem só ids,
 * datas, números e nomes de campo.
 *
 * Os uuids são tirados do texto antes da busca: um uuid aleatório pode conter "1987" e dar falso positivo.
 */

let aberto: CenarioGruposAberto;
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-11-05T15:00:00Z'),
});

const TELEFONE = '11987654321';
const ANO = 1987;

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RE_UUID_INTEIRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
/** Os nomes de campo que um evento pode citar (`jogador_editado` e afins, SEC-008). */
const NOMES_DE_CAMPO = new Set([
  'apelido',
  'anoNascimento',
  'posicao',
  'telefone',
  'pontuacaoInicial',
  'nome',
]);

let jogadorId = '';

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(caminho: string, metodo: string, corpo?: unknown): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}`,
  });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}${caminho}`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function esperarStatus(r: Promise<Response>, status: number): Promise<Response> {
  const resposta = await r;
  if (resposta.status !== status)
    throw new Error(`esperava ${status}, veio ${resposta.status}: ${await resposta.text()}`);
  return resposta;
}

/** As linhas de auditoria do jogador, como texto (sem `momento`) e com o `resumo` à parte. */
async function linhasDoJogador() {
  const r = await aberto.db.query<{ texto: string; acao: string; resumo: unknown }>(
    `SELECT (to_jsonb(a) - 'momento')::text AS texto, a.acao, a.resumo
       FROM auditoria a
      WHERE a.grupo_id = $1 AND a.entidade_id = $2`,
    [aberto.cenario.grupoG, jogadorId],
  );
  return r.rows;
}

/** As folhas do `resumo` que não são id, data, número, booleano, nulo nem nome de campo. */
function folhasProibidas(valor: unknown, caminho = 'resumo'): string[] {
  if (valor === null || typeof valor === 'number' || typeof valor === 'boolean') return [];
  if (typeof valor === 'string') {
    const ok = RE_UUID_INTEIRO.test(valor) || RE_DATA.test(valor) || NOMES_DE_CAMPO.has(valor);
    return ok ? [] : [`${caminho} = ${JSON.stringify(valor)}`];
  }
  if (Array.isArray(valor)) return valor.flatMap((v, i) => folhasProibidas(v, `${caminho}[${i}]`));
  if (typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) =>
      folhasProibidas(v, `${caminho}.${k}`),
    );
  }
  return [`${caminho}: tipo ${typeof valor}`];
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();

  const criado = await esperarStatus(
    pedir('/jogadores', 'POST', {
      apelido: 'Marcador',
      anoNascimento: ANO,
      posicao: 'meia',
      telefone: TELEFONE,
      dataEntrada: '2026-02-05',
      pontuacaoInicial: 3,
    }),
    201,
  );
  jogadorId = ((await criado.json()) as { id: string }).id;

  const outros = {
    apelido: 'Marcador Editado',
    anoNascimento: 1990,
    posicao: 'zagueiro',
    telefone: '11912345678',
    pontuacaoInicial: 4,
  };
  await esperarStatus(pedir(`/jogadores/${jogadorId}`, 'PATCH', outros), 200);
  await esperarStatus(
    pedir(`/jogadores/${jogadorId}`, 'PATCH', {
      ...outros,
      anoNascimento: ANO,
      telefone: TELEFONE,
    }),
    200,
  );
  await esperarStatus(
    pedir(`/jogadores/${jogadorId}/inativar`, 'POST', { data: '2026-10-01' }),
    200,
  );
  await esperarStatus(
    pedir(`/jogadores/${jogadorId}/reativar`, 'POST', { data: '2026-10-10' }),
    200,
  );

  const ficha = (await (
    await esperarStatus(pedir(`/jogadores/${jogadorId}`, 'GET'), 200)
  ).json()) as {
    periodos: Array<{ id: string }>;
  };
  const primeiro = ficha.periodos[0]!.id;
  await esperarStatus(
    pedir(`/jogadores/${jogadorId}/periodos/${primeiro}`, 'PATCH', { saida: '2026-09-30' }),
    200,
  );
  await esperarStatus(pedir(`/jogadores/${jogadorId}/inicio`, 'PUT', { data: '2026-02-01' }), 200);
  await esperarStatus(pedir(`/jogadores/${jogadorId}`, 'DELETE'), 204);
});

afterAll(async () => {
  // Se o beforeAll parou no meio, o jogador ficou: sai aqui (a auditoria fica, como no produto).
  if (jogadorId) await aberto?.db.query('DELETE FROM jogadores WHERE id = $1', [jogadorId]);
  await aberto?.fechar();
});

describe('auditoria sem dado pessoal', () => {
  it('GEL-113: todas as escritas do jogador deixaram evento', async () => {
    const acoes = new Set((await linhasDoJogador()).map((l) => l.acao));
    for (const acao of [
      'jogador_criado',
      'jogador_editado',
      'jogador_pontuacao_inicial_alterada',
      'jogador_inativado',
      'jogador_reativado',
      'jogador_periodo_corrigido',
      'jogador_inicio_alterado',
      'jogador_excluido',
    ]) {
      expect(acoes, acao).toContain(acao);
    }
  });

  it('GEL-113: nenhuma linha contém o telefone nem o ano de nascimento', async () => {
    const linhas = await linhasDoJogador();
    expect(linhas.length).toBeGreaterThanOrEqual(9);
    for (const l of linhas) {
      const semIds = l.texto.replace(RE_UUID, '<id>');
      expect(semIds, l.acao).not.toContain(TELEFONE);
      expect(semIds, l.acao).not.toContain(String(ANO));
      expect(semIds, l.acao).not.toContain('11912345678');
    }
  });

  it('GEL-113: os eventos têm só ids, datas, números e nomes de campo', async () => {
    for (const l of await linhasDoJogador()) {
      expect(folhasProibidas(l.resumo), l.acao).toEqual([]);
    }
  });
});
