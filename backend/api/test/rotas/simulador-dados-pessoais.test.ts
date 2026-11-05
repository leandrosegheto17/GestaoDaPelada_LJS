import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Só os campos permitidos nas respostas do simulador e na escalação gravada (T41 da simulador; SIM-82, SIM-03, `S:313`),
 * com o app real como `pelada_app` e o relógio fixo na terça 2026-03-03; a partida é da quinta 2026-03-05.
 *
 * Os jogadores criados aqui têm telefone, ano de nascimento, posição e nota, para que um vazamento apareça. A varredura
 * é feita no JSON cru da resposta (não no `parse` do contrato, que descartaria a chave a mais), em todos os níveis.
 *
 * Molde: `CAMPOS_PROIBIDOS_PUBLICO` e `camposProibidosEm` (`contrato/src/publico.ts:17`), com a lista própria do simulador.
 */

let aberto: CenarioGruposAberto;
let ativos: string[] = [];

const DATA = '2026-03-05';
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-03T15:00:00Z'),
});

/** O que nunca sai nas respostas do simulador nem na composição gravada (SIM-82, SIM-03). */
const CAMPOS_PROIBIDOS_SIMULADOR = [
  'telefone',
  'anoNascimento',
  'ano_nascimento',
  'idade',
  'posicao',
  'posicaoEmCampo',
  'notas',
  'nota',
  'habilidades',
  'pontos',
  'pontuacaoInicial',
  'inicioPontuacao',
  'periodos',
] as const;

/**
 * As chaves de um jogador nas respostas (SIM-03, SIM-82): id, apelido, nível, `semNota`, `semAno` e "só 1º"; o titular
 * de 2 times leva também `saiNoIntervalo` (SIM-24), que é da escalação, não dado da pessoa.
 */
const CHAVES_DE_JOGADOR = new Set([
  'id',
  'apelido',
  'nivel',
  'semNota',
  'semAno',
  'so1oTempo',
  'saiNoIntervalo',
]);

/** Os caminhos dos campos proibidos achados em qualquer nível de `valor`. */
function proibidosEm(valor: unknown, caminho = ''): string[] {
  const lista: readonly string[] = CAMPOS_PROIBIDOS_SIMULADOR;
  if (Array.isArray(valor))
    return valor.flatMap((item, i) => proibidosEm(item, caminho ? `${caminho}.${i}` : `${i}`));
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([chave, filho]) => {
    const aqui = caminho ? `${caminho}.${chave}` : chave;
    return [...(lista.includes(chave) ? [aqui] : []), ...proibidosEm(filho, aqui)];
  });
}

/** Todo objeto com `apelido` (um jogador) em qualquer nível, com o caminho. */
function jogadoresEm(valor: unknown, caminho = ''): Array<{ caminho: string; chaves: string[] }> {
  if (Array.isArray(valor)) return valor.flatMap((item, i) => jogadoresEm(item, `${caminho}.${i}`));
  if (valor === null || typeof valor !== 'object') return [];
  const aqui = 'apelido' in valor ? [{ caminho, chaves: Object.keys(valor) }] : [];
  return [
    ...aqui,
    ...Object.entries(valor).flatMap(([chave, filho]) => jogadoresEm(filho, `${caminho}.${chave}`)),
  ];
}

/** As chaves fora de `CHAVES_DE_JOGADOR` nos jogadores achados. */
function chavesAMais(valor: unknown): string[] {
  return jogadoresEm(valor).flatMap((j) =>
    j.chaves.filter((c) => !CHAVES_DE_JOGADOR.has(c)).map((c) => `${j.caminho}.${c}`),
  );
}

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<Response> {
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

/** Jogador de G com todos os dados pessoais preenchidos, ativo desde 2026-01-01, com uma nota. */
async function jogadorCompleto(apelido: string, telefone: string): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, telefone, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, $3, 1988, 'zagueiro', 0, $4, now(), $4, now()) RETURNING id`,
    [cenario.grupoG, apelido, telefone, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
    [id, cenario.grupoG],
  );
  await db.query(
    `INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 7)`,
    [id, cenario.idsG.habilidade, cenario.grupoG],
  );
  return id;
}

/** Os 10 ativos de G em 2 times de 4, um reserva que entra por time. */
const entrada = () => ({
  formato: 'dois_times' as const,
  data: DATA,
  n: 4,
  k: 1,
  aptos: ativos.map((id) => ({ id, so1oTempo: false })),
});

interface JogadorDaComposicao {
  id: string;
  so1oTempo: boolean;
}

/** A composição do resultado cru de 2 times na forma do corpo (só ids e "só 1º"). */
function composicaoDe(resultado: {
  times: Array<{ titulares: JogadorDaComposicao[]; entramNo2oTempo: JogadorDaComposicao[] }>;
  naoEntra: Array<{ id: string }>;
}) {
  return {
    times: resultado.times.map((t) => ({
      titulares: t.titulares.map((j) => ({ id: j.id, so1oTempo: j.so1oTempo })),
      entramNo2oTempo: t.entramNo2oTempo.map((j) => ({ id: j.id, so1oTempo: j.so1oTempo })),
    })),
    naoEntra: resultado.naoEntra.map((j) => j.id),
  };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const novos: string[] = [];
  for (let i = 1; i <= 8; i++) novos.push(await jogadorCompleto(`Pessoal ${i}`, `1199999000${i}`));
  ativos = [aberto.cenario.idsG.jogadorAtivo, aberto.cenario.idsG.jogadorHistorico, ...novos];
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM escalacoes WHERE grupo_id = $1 AND data = $2', [
    cenario.grupoG,
    DATA,
  ]);
  await db.query(`DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'escalacao_confirmada'`, [
    cenario.grupoG,
  ]);
});

describe('simulador: só os campos permitidos', () => {
  it('SIM-03: o contexto devolve cada jogador só com id, apelido, nível, semNota e semAno', async () => {
    const r = await chamar('GET', `/simulador/contexto?data=${DATA}`);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { jogadores: Array<Record<string, unknown>> };
    expect(json.jogadores.length).toBeGreaterThanOrEqual(10);
    for (const j of json.jogadores)
      expect(Object.keys(j).sort()).toEqual(['apelido', 'id', 'nivel', 'semAno', 'semNota']);
    expect(proibidosEm(json)).toEqual([]);
    // Nem o valor do telefone escapa com outro nome.
    expect(JSON.stringify(json)).not.toContain('11999990001');
  });

  it('SIM-82: varredura recursiva das respostas do contexto, do sugerir e do avaliar sem campo proibido', async () => {
    const contexto = await (await chamar('GET', `/simulador/contexto?data=${DATA}`)).json();

    const rs = await chamar('POST', '/simulador/sugerir', entrada());
    expect(rs.status).toBe(200);
    const sugestao = (await rs.json()) as Parameters<typeof composicaoDe>[0];

    const ra = await chamar('POST', '/simulador/avaliar', {
      ...entrada(),
      composicao: composicaoDe(sugestao),
    });
    expect(ra.status).toBe(200);
    const avaliacao: unknown = await ra.json();

    for (const [nome, json] of [
      ['contexto', contexto],
      ['sugerir', sugestao],
      ['avaliar', avaliacao],
    ] as const) {
      expect(proibidosEm(json), nome).toEqual([]);
      expect(chavesAMais(json), nome).toEqual([]);
      const texto = JSON.stringify(json);
      expect(texto, nome).not.toContain('11999990001');
      expect(texto, nome).not.toContain('zagueiro');
    }
    // A varredura acha os jogadores: sem eles, o teste não provaria nada.
    expect(jogadoresEm(sugestao).length).toBeGreaterThanOrEqual(10);
  });

  it('SIM-82: o JSON gravado em escalacoes.composicao só tem id e so1oTempo por jogador', async () => {
    const { db, cenario } = aberto;
    const sugestao = (await (
      await chamar('POST', '/simulador/sugerir', entrada())
    ).json()) as Parameters<typeof composicaoDe>[0];
    const r = await chamar('POST', '/escalacoes', {
      formato: 'dois_times',
      data: DATA,
      n: 4,
      k: 1,
      composicao: composicaoDe(sugestao),
    });
    expect(r.status).toBe(201);
    expect(proibidosEm(await r.json())).toEqual([]);

    const linha = await db.query<{ composicao: unknown }>(
      'SELECT composicao FROM escalacoes WHERE grupo_id = $1 AND data = $2',
      [cenario.grupoG, DATA],
    );
    const gravada = linha.rows[0]?.composicao as {
      times: Array<Record<string, Array<Record<string, unknown>>>>;
      naoEntra: unknown[];
    };
    expect(gravada).toBeDefined();
    expect(Object.keys(gravada).sort()).toEqual(['naoEntra', 'times']);
    let jogadores = 0;
    for (const time of gravada.times) {
      expect(Object.keys(time).sort()).toEqual(['entramNo2oTempo', 'titulares']);
      for (const lista of Object.values(time)) {
        for (const j of lista) {
          jogadores++;
          expect(Object.keys(j).sort()).toEqual(['id', 'so1oTempo']);
        }
      }
    }
    expect(jogadores).toBeGreaterThan(0);
    // "Não entra" grava só os ids.
    for (const id of gravada.naoEntra) expect(typeof id).toBe('string');
    expect(proibidosEm(gravada)).toEqual([]);
    expect(JSON.stringify(gravada)).not.toContain('Pessoal');
  });
});
