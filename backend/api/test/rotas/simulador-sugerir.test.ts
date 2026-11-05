import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENSAGEM_APTOS_INATIVOS, sugerirResposta } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/simulador/sugerir` (T35 da simulador; SIM-17, SIM-47, SIM-53 a SIM-56, SIM-60, SIM-80),
 * com o app real como `pelada_app` e o relógio fixo numa terça (2026-03-03). A partida é da quinta 2026-03-05. Em G,
 * além de Toninho e Bira (ativos desde 2026-01-01), o `beforeAll` cria 17 ativos e uma partida em 2026-02-26 com parte
 * deles presente; Zé Inativo saiu em 2025. Um jogador de H mostra o isolamento.
 *
 * Casos limite: id inativo, de outro grupo ou inexistente (mesma mensagem, sem revelar, SIM-54, SIM-80); aptos
 * insuficientes em 3+ (422 com a descrição, SIM-56); partida na própria data não muda a ordem (SIM-17); log sem dado
 * pessoal (SIM-60); nada gravado.
 */

let aberto: CenarioGruposAberto;
let ativos: string[] = [];
let deH = '';
let partidaAnterior = '';

const DATA = '2026-03-05';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-03-03T15:00:00Z') });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function sugerir(corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/simulador/sugerir`,
    { method: 'POST', headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(grupo: string, apelido: string, conta: string): Promise<string> {
  const r = await aberto.db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  const id = r.rows[0]!.id;
  await aberto.db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [
    id,
    grupo,
  ]);
  return id;
}

async function partida(data: string, presentes: readonly string[]): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, data, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  for (const jogador of presentes) {
    await db.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
      id,
      jogador,
      cenario.grupoG,
    ]);
  }
  return id;
}

const dois = (ids: readonly string[], extra: Partial<{ n: number; k: number | 'ilimitado' }> = {}) => ({
  formato: 'dois_times',
  data: DATA,
  n: 7,
  k: 2,
  ...extra,
  aptos: ids.map((id) => ({ id, so1oTempo: false })),
});

async function contagens(): Promise<number[]> {
  const { db, cenario } = aberto;
  const um = async (sql: string) => (await db.query<{ n: number }>(sql, [cenario.grupoG])).rows[0]?.n ?? -1;
  return [
    await um('SELECT count(*)::int AS n FROM escalacoes WHERE grupo_id = $1'),
    await um('SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1'),
    await um('SELECT count(*)::int AS n FROM partidas WHERE grupo_id = $1'),
    await um('SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = $1'),
  ];
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { cenario } = aberto;
  const novos: string[] = [];
  for (let i = 1; i <= 17; i++) novos.push(await novoJogador(cenario.grupoG, `Sim ${String(i).padStart(2, '0')}`, cenario.contaC));
  ativos = [cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico, ...novos];
  deH = await novoJogador(cenario.grupoH, 'Do Outro Grupo', cenario.contaB);
  // Uma partida antes da data, com metade presente: a ordem de prioridade não fica só nos desempates.
  partidaAnterior = await partida('2026-02-26', ativos.filter((_, i) => i % 2 === 1));
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST …/simulador/sugerir', () => {
  it('SIM-47: sugestão de 19 aptos com a ordem de prioridade e nada gravado', async () => {
    const antes = await contagens();
    const r = await sugerir(dois(ativos));
    expect(r.status).toBe(200);
    const corpo = sugerirResposta.parse(await r.json());
    expect(corpo.formato).toBe('dois_times');
    if (corpo.formato !== 'dois_times') return;
    expect(corpo).toMatchObject({ data: DATA, n: 7, k: 2, descricao: '2 times de 7 · 5 reservas' });
    expect([...corpo.ordemPrioridade].sort()).toEqual([...ativos].sort());
    expect(corpo.times.map((t) => t.titulares.length)).toEqual([7, 7]);
    // Todo apto aparece uma vez: titulares, reservas que entram e "não entra".
    const todos = [
      ...corpo.times.flatMap((t) => [...t.titulares, ...t.entramNo2oTempo].map((j) => j.id)),
      ...corpo.naoEntra.map((j) => j.id),
    ];
    expect([...todos].sort()).toEqual([...ativos].sort());
    expect(await contagens()).toEqual(antes);
  });

  it('SIM-47: 3 ou mais times sem ordem de prioridade', async () => {
    const r = await sugerir({ formato: 'varios_times', data: DATA, n: 4, aptos: ativos.slice(0, 18).map((id) => ({ id })) });
    expect(r.status).toBe(200);
    const corpo = sugerirResposta.parse(await r.json());
    expect(corpo).not.toHaveProperty('ordemPrioridade');
    expect(corpo.formato === 'varios_times' && corpo.times.map((t) => [t.jogadores.length, t.incompleto])).toEqual([
      [4, false],
      [4, false],
      [4, false],
      [4, false],
      [2, true],
    ]);
  });

  it('SIM-54: id de jogador inativo na data dá 422 no campo aptos', async () => {
    const r = await sugerir(dois([...ativos.slice(0, 18), aberto.cenario.idsG.jogadorInativo]));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { aptos: MENSAGEM_APTOS_INATIVOS } });
  });

  it('SIM-54, SIM-80: id do grupo B dá a mesma mensagem, sem apelido nem id na resposta', async () => {
    const r = await sugerir(dois([...ativos.slice(0, 18), deH]));
    expect(r.status).toBe(422);
    const texto = await r.text();
    expect(JSON.parse(texto)).toMatchObject({ mensagens: { aptos: MENSAGEM_APTOS_INATIVOS } });
    expect(texto).not.toContain(deH);
    expect(texto).not.toContain('Do Outro Grupo');
  });

  it('SIM-54: id que não existe dá a mesma mensagem', async () => {
    const r = await sugerir(dois([...ativos.slice(0, 18), crypto.randomUUID()]));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { aptos: MENSAGEM_APTOS_INATIVOS } });
  });

  it('SIM-56: 8 aptos, 3+, N = 4: 422 com a descrição da prévia em aptos', async () => {
    const r = await sugerir({ formato: 'varios_times', data: DATA, n: 4, aptos: ativos.slice(0, 8).map((id) => ({ id })) });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      mensagens: { aptos: 'Com 8 aptos e N = 4 não há 3 times. Use N menor ou o formato 2 times.' },
    });
  });

  it('SIM-55: K fora da faixa e N ausente dão 422 no campo', async () => {
    const semK = await sugerir(dois(ativos, { k: 21 }));
    expect(semK.status).toBe(422);
    expect(await semK.json()).toMatchObject({ campos: expect.arrayContaining(['k']) });
    const { n: _n, ...semN } = dois(ativos);
    const r = await sugerir(semN);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: expect.arrayContaining(['n']) });
  });

  it('SIM-53: mais de 60 aptos dá 422 no campo aptos', async () => {
    const muitos = Array.from({ length: 61 }, () => crypto.randomUUID());
    const r = await sugerir(dois(muitos));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: expect.arrayContaining(['aptos']) });
  });

  it('SIM-60: uma linha de log com formato, n, k e aptos, sem id, apelido nem grupo', async () => {
    const linhas: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      linhas.push(a.map(String).join(' '));
    });
    await sugerir(dois(ativos));
    const doSimulador = linhas.filter((l) => l.includes('simulador_sugerir'));
    expect(doSimulador).toHaveLength(1);
    const linha = doSimulador[0] ?? '';
    expect(JSON.parse(linha)).toEqual({ evento: 'simulador_sugerir', formato: 'dois_times', n: 7, k: 2, aptos: 19 });
    for (const proibido of [...ativos, aberto.cenario.grupoG, 'Toninho', 'Bira', 'Sim 01']) {
      expect(linha).not.toContain(proibido);
    }
  });

  it('SIM-17: a partida da própria data não muda a ordem', async () => {
    const antes = sugerirResposta.parse(await (await sugerir(dois(ativos))).json());
    // Na própria data, presentes os 10 últimos da ordem: se contassem, subiriam.
    const ultimos = antes.formato === 'dois_times' ? antes.ordemPrioridade.slice(-10) : [];
    const daData = await partida(DATA, ultimos);
    try {
      const depois = sugerirResposta.parse(await (await sugerir(dois(ativos))).json());
      expect(depois.formato === 'dois_times' && depois.ordemPrioridade).toEqual(
        antes.formato === 'dois_times' && antes.ordemPrioridade,
      );
    } finally {
      await aberto.db.query('DELETE FROM presencas WHERE partida_id = $1', [daData]);
      await aberto.db.query('DELETE FROM partidas WHERE id = $1', [daData]);
    }
  });

  it('SIM-17: a partida anterior conta (controle do caso acima)', async () => {
    const com = sugerirResposta.parse(await (await sugerir(dois(ativos))).json());
    // Entre os 17 criados aqui (pontuação inicial 0, sem outra partida), os presentes de 2026-02-26 (índices ímpares
    // de `ativos`) ficam à frente dos ausentes; Toninho e Bira ficam fora da conta (têm o histórico do cenário).
    const novos = new Set(ativos.slice(2));
    const presentes = new Set(ativos.filter((id, i) => i % 2 === 1 && novos.has(id)));
    const ordem = (com.formato === 'dois_times' ? com.ordemPrioridade : []).filter((id) => novos.has(id));
    expect(ordem.slice(0, presentes.size).every((id) => presentes.has(id))).toBe(true);
    expect(partidaAnterior).toBeTruthy();
  });

  it('SIM-80: a conta B recebe 404 na sugestão de G', async () => {
    const r = await sugerir(dois(ativos), aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});
