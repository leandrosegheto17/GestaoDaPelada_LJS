import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextoResposta, MENSAGEM_DATA_INVALIDA } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/grupos/:grupoId/simulador/contexto` (T33 da simulador; SIM-01 a SIM-04), com o app real como `pelada_app`.
 * G é de quinta (`grupo_criar` do cenário). Relógio numa terça (2026-03-03, 12h de São Paulo): o próximo dia de jogo é
 * a quinta 2026-03-05. Em G: Toninho e Bira ativos desde 2026-01-01, Zé Inativo de 2025-03-01 a 2025-12-31. Os
 * jogadores criados por um caso saem no `afterEach`.
 */

let aberto: CenarioGruposAberto;

const TERCA = '2026-03-03';
const QUINTA = '2026-03-05';
const naTerca = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-03T15:00:00Z'),
});
const naQuinta = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-05T15:00:00Z'),
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

async function contexto(
  consulta = '',
  app = naTerca,
  conta = aberto.cenario.contaC,
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/simulador/contexto${consulta}`,
    { method: 'GET', headers },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(apelido: string, ano: number | null = 1990): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, 'meia', '11999990000', 0, $4, now(), $4, now()) RETURNING id`,
    [cenario.grupoG, apelido, ano, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
    [id, cenario.grupoG],
  );
  return id;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM jogadores WHERE grupo_id = $1 AND id NOT IN ($2, $3, $4)`, [
    cenario.grupoG,
    cenario.idsG.jogadorAtivo,
    cenario.idsG.jogadorInativo,
    cenario.idsG.jogadorHistorico,
  ]);
});

describe('GET …/simulador/contexto', () => {
  it('SIM-01: numa terça, grupo de quinta com 20 ativos: a quinta seguinte, hoje e os 20 em ordem alfabética', async () => {
    for (let i = 0; i < 18; i += 1) await novoJogador(`Jogador ${String(i).padStart(2, '0')}`);
    const r = await contexto();
    expect(r.status).toBe(200);
    const corpo = contextoResposta.parse(await r.json());
    expect(corpo.dataSugerida).toBe(QUINTA);
    expect(corpo.hoje).toBe(TERCA);
    expect(corpo.jogadores).toHaveLength(20);
    const esperados = [
      'Bira',
      ...Array.from({ length: 18 }, (_, i) => `Jogador ${String(i).padStart(2, '0')}`),
      'Toninho',
    ];
    expect(corpo.jogadores.map((j) => j.apelido)).toEqual(esperados);
  });

  it('SIM-01: numa quinta, o próximo dia de jogo é hoje', async () => {
    const corpo = contextoResposta.parse(await (await contexto('', naQuinta)).json());
    expect(corpo.dataSugerida).toBe(QUINTA);
    expect(corpo.hoje).toBe(QUINTA);
  });

  it('SIM-02: com data de outra semana, lista os ativos dela e mantém a dataSugerida', async () => {
    const { cenario } = aberto;
    const corpo = contextoResposta.parse(await (await contexto('?data=2025-06-05')).json());
    expect(corpo.dataSugerida).toBe(QUINTA);
    expect(corpo.jogadores.map((j) => j.id)).toEqual([cenario.idsG.jogadorInativo]);
  });

  it('SIM-03: cada jogador só com id, apelido, nível, semNota e semAno; sem telefone, ano nem posição', async () => {
    const semAno = await novoJogador('Sem Ano', null);
    const r = await contexto();
    const corpo = (await r.json()) as { jogadores: Array<Record<string, unknown>> };
    for (const j of corpo.jogadores) {
      expect(Object.keys(j).sort()).toEqual(['apelido', 'id', 'nivel', 'semAno', 'semNota']);
    }
    expect(corpo.jogadores.find((j) => j.id === semAno)).toMatchObject({
      semAno: true,
      nivel: 550,
      semNota: true,
    });
    expect(
      corpo.jogadores.find((j) => j.id === aberto.cenario.idsG.jogadorHistorico),
    ).toMatchObject({
      semAno: true,
      nivel: 700,
      semNota: false,
    });
    expect(JSON.stringify(corpo)).not.toContain('11999990000');
  });

  it('SIM-03: jogador com ano sai com semAno falso', async () => {
    const comAno = await novoJogador('Com Ano', 1995);
    const corpo = contextoResposta.parse(await (await contexto()).json());
    expect(corpo.jogadores.find((j) => j.id === comAno)?.semAno).toBe(false);
  });

  it.each(['2026-13-01', '2026-02-30', '2026-3-5', 'amanha', ''])(
    'SIM-04: data=%s responde 422 no campo data',
    async (data) => {
      const r = await contexto(`?data=${encodeURIComponent(data)}`);
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({
        codigo: 'dados_invalidos',
        mensagens: { data: MENSAGEM_DATA_INVALIDA },
      });
    },
  );

  it('SIM-04: parâmetro desconhecido é recusado com 422', async () => {
    expect((await contexto('?grupo=outro')).status).toBe(422);
  });

  it('a conta B não vê o contexto de G (404)', async () => {
    const r = await contexto('', naTerca, aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});
