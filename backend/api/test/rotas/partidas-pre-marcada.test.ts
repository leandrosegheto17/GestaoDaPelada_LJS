import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { partidaNova } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET …/partidas/nova` pré-marcada pela escalação (T38 da simulador; SIM-75, SIM-76, SIM-78, SIM-88), com o app real
 * como `pelada_app` e o relógio fixo no sábado 14/03/2026: a sugerida é a quinta 12/03. Em G, Toninho e Bira mais 17
 * criados aqui formam a escalação de 19 (2 × 7, 2 entram por time, 1 "não entra"); Fora Da Escalação é ativo e não está
 * nela; Saiu Antes está na escalação, mas o período dele terminou em 10/03 (SIM-88). As escalações são gravadas como
 * owner e apagadas no `afterEach`.
 *
 * Casos limite: escalação válida (presentes os da escalação, marca verdadeira); JSON inválido (como antes, falso);
 * jogador da escalação inativado antes da data (não aparece); partida já lançada (a edição não muda).
 */

let aberto: CenarioGruposAberto;
let escalados: string[] = [];
let foraDaEscalacao = '';
let saiuAntes = '';

const DATA = '2026-03-12';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-03-14T15:00:00Z') });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(caminho: string): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}` });
  const ctx = contextoFalso();
  const r = await app.request(`/api/grupos/${aberto.cenario.grupoG}${caminho}`, { method: 'GET', headers }, envAcesso(aberto.url), ctx);
  await ctx.esperar();
  return r;
}

async function novoJogador(apelido: string, fim: string | null = null): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', $3)`, [
    id,
    cenario.grupoG,
    fim,
  ]);
  return id;
}

/** A escalação de 2 times com os ids na ordem: 7 + 7 titulares, 2 + 2 entram, o resto "não entra". */
function composicaoDois(ids: readonly string[]) {
  const j = (id: string) => ({ id, so1oTempo: false });
  return {
    times: [
      { titulares: ids.slice(0, 7).map(j), entramNo2oTempo: ids.slice(14, 16).map(j) },
      { titulares: ids.slice(7, 14).map(j), entramNo2oTempo: ids.slice(16, 18).map(j) },
    ],
    naoEntra: ids.slice(18),
  };
}

async function gravarEscalacao(data: string, composicao: unknown): Promise<void> {
  const { db, cenario } = aberto;
  await db.query(
    `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
     VALUES ($1, $2, 'dois_times', 7, 2, $3::jsonb, $4, now())`,
    [cenario.grupoG, data, JSON.stringify(composicao), cenario.contaC],
  );
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { cenario } = aberto;
  const novos: string[] = [];
  for (let i = 1; i <= 16; i++) novos.push(await novoJogador(`Escalado ${String(i).padStart(2, '0')}`));
  saiuAntes = await novoJogador('Saiu Antes', '2026-03-10');
  // 19 na escalação: Toninho, Bira, 16 criados e o que saiu antes da data (o último, em "não entra").
  escalados = [cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico, ...novos, saiuAntes];
  foraDaEscalacao = await novoJogador('Fora Da Escalação');
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM escalacoes WHERE grupo_id = $1', [aberto.cenario.grupoG]);
});

describe('GET …/partidas/nova pré-marcada pela escalação', () => {
  it('SIM-75: escalação de 19 (1 "não entra") dá os escalados ativos presente e a marca verdadeira', async () => {
    // Para a contagem de 19 presentes, "não entra" aqui é um ativo: troca o que saiu antes por Fora Da Escalação.
    const dezenove = [...escalados.slice(0, 18), foraDaEscalacao];
    await gravarEscalacao(DATA, composicaoDois(dezenove));
    const r = await pedir('/partidas/nova');
    expect(r.status).toBe(200);
    const corpo = partidaNova.parse(await r.json());
    expect(corpo.data).toBe(DATA);
    expect(corpo.preMarcadaPelaEscalacao).toBe(true);
    const presentes = corpo.jogadores.filter((j) => j.situacao === 'presente').map((j) => j.id);
    expect(presentes).toHaveLength(19);
    expect([...presentes].sort()).toEqual([...dezenove].sort());
    // Quem é ativo e não está na escalação fica ausente.
    expect(corpo.jogadores.filter((j) => j.situacao === 'ausente').map((j) => j.id)).toEqual([]);
  });

  it('SIM-75: ativo fora da escalação vem ausente', async () => {
    await gravarEscalacao(DATA, composicaoDois(escalados));
    const corpo = partidaNova.parse(await (await pedir('/partidas/nova')).json());
    expect(corpo.jogadores.find((j) => j.id === foraDaEscalacao)?.situacao).toBe('ausente');
  });

  it('SIM-88: jogador da escalação inativado antes da data não aparece', async () => {
    await gravarEscalacao(DATA, composicaoDois(escalados));
    const corpo = partidaNova.parse(await (await pedir('/partidas/nova')).json());
    expect(corpo.jogadores.map((j) => j.id)).not.toContain(saiuAntes);
    expect(corpo.jogadores.filter((j) => j.situacao === 'presente')).toHaveLength(18);
  });

  it('SIM-76: escalação inválida no banco dá todos ausente e falso', async () => {
    await gravarEscalacao(DATA, { x: 1 });
    const corpo = partidaNova.parse(await (await pedir('/partidas/nova')).json());
    expect(corpo.preMarcadaPelaEscalacao).toBe(false);
    expect(corpo.jogadores.every((j) => j.situacao === 'ausente')).toBe(true);
  });

  it('SIM-76: sem escalação na data, como antes (escalação de outra data não conta)', async () => {
    await gravarEscalacao('2026-03-05', composicaoDois(escalados));
    const corpo = partidaNova.parse(await (await pedir('/partidas/nova')).json());
    expect(corpo.preMarcadaPelaEscalacao).toBe(false);
    expect(corpo.jogadores.every((j) => j.situacao === 'ausente')).toBe(true);
  });

  it('SIM-78: GET partidas/:data de partida já lançada não muda com escalação na data', async () => {
    // O cenário tem a partida de 2026-01-08, com Bira presente.
    const antes = await (await pedir('/partidas/2026-01-08')).json();
    await gravarEscalacao('2026-01-08', composicaoDois(escalados));
    const depois = await (await pedir('/partidas/2026-01-08')).json();
    expect(depois).toEqual(antes);
  });
});
