import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { grupoDetalheComPartidas } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/grupos/:grupoId` com o início do grupo (partidas-e-ranking T43; PAR-132), com o app real como
 * `pelada_app` e o relógio fixo na sexta 13/03/2026 (12h de São Paulo): G joga às quintas, então a data sugerida é
 * 12/03. O cenário de grupos tem a configuração de pesos de 2026-01-01 (não padrão) e uma partida em 2026-01-08.
 *
 * Simulador T39 (SIM-08): a resposta passa a trazer `proximoDiaDeJogo` e `escalacaoNoProximoDia`, e o schema do
 * teste é o contrato inteiro do GET. Mudança de teste existente autorizada (`## Autorizações` do STATE.md,
 * 2026-11-04): o schema sem os 2 campos rejeitaria a resposta nova; nenhuma asserção foi removida.
 */

let aberto: CenarioGruposAberto;

const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-13T15:00:00Z'),
});
/** Terça 10/03/2026, 12h de São Paulo: o próximo dia de jogo de G (quinta) é 12/03 (SIM-08). */
const appTerca = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-10T15:00:00Z'),
});

/** O detalhe pelo contrato do GET; o saldo (FIN-34) é da financeiro e sai antes. */
function detalheDoGet(json: unknown) {
  const { saldoFinanceiroCentavos: _saldo, ...resto } = json as Record<string, unknown>;
  return grupoDetalheComPartidas.parse(resto);
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

async function detalhe(conta = aberto.cenario.contaC, comApp = app): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  const ctx = contextoFalso();
  const r = await comApp.request(
    `/api/grupos/${aberto.cenario.grupoG}`,
    { method: 'GET', headers },
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

afterEach(async () => {
  await aberto.db.query(`DELETE FROM partidas WHERE grupo_id = $1 AND data = '2026-03-12'`, [
    aberto.cenario.grupoG,
  ]);
});

describe('GET /api/grupos/:grupoId com o início do grupo', () => {
  it('PAR-132: numa sexta, dataSugeridaPartida é a quinta anterior e partidaNaDataSugerida é falso sem partida', async () => {
    const r = await detalhe();
    expect(r.status).toBe(200);
    const g = detalheDoGet(await r.json());
    expect(g).toMatchObject({
      dataSugeridaPartida: '2026-03-12',
      partidaNaDataSugerida: false,
      partidasNoMes: 0,
      pesosVigentesDesde: '2026-01-01',
      pesosPadrao: false,
      aparelhosNaSemana: 0,
    });
  });

  it('PAR-132: com a partida da quinta lançada, partidaNaDataSugerida reflete o banco e partidasNoMes conta 1', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
       VALUES ($1, '2026-03-12', $2, now(), $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
    const g = detalheDoGet(await (await detalhe()).json());
    expect(g.partidaNaDataSugerida).toBe(true);
    expect(g.partidasNoMes).toBe(1);
  });

  it('PAR-132: a outra admin, sem acesso ao financeiro, recebe os 6 campos sem o saldo', async () => {
    const json = (await (await detalhe(aberto.cenario.contaO)).json()) as Record<string, unknown>;
    expect('saldoFinanceiroCentavos' in json).toBe(false);
    expect(detalheDoGet(json).dataSugeridaPartida).toBe('2026-03-12');
  });

  it('PAR-132: sem vínculo, 404', async () => {
    const r = await detalhe(aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});

describe('GET /api/grupos/:grupoId com o próximo dia de jogo (simulador T39)', () => {
  it('SIM-08: numa sexta, proximoDiaDeJogo é a quinta seguinte, não a sugerida de trás', async () => {
    const g = detalheDoGet(await (await detalhe()).json());
    expect(g.dataSugeridaPartida).toBe('2026-03-12');
    expect(g).toMatchObject({ proximoDiaDeJogo: '2026-03-19', escalacaoNoProximoDia: false });
  });

  it('SIM-08: relógio numa terça: proximoDiaDeJogo é a quinta seguinte e escalacaoNoProximoDia segue o banco', async () => {
    const { db, cenario } = aberto;
    const sem = detalheDoGet(await (await detalhe(cenario.contaC, appTerca)).json());
    expect(sem).toMatchObject({ proximoDiaDeJogo: '2026-03-12', escalacaoNoProximoDia: false });
    // Escalação da quinta gravada como owner; apagada no finally para não vazar para os outros testes.
    await db.query(
      `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
       VALUES ($1, '2026-03-12', 'dois_times', 7, 2, '{"times":[]}'::jsonb, $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
    try {
      const com = detalheDoGet(await (await detalhe(cenario.contaC, appTerca)).json());
      expect(com).toMatchObject({ proximoDiaDeJogo: '2026-03-12', escalacaoNoProximoDia: true });
      // A escalação da quinta 12/03 não conta para a sexta 13/03, cujo próximo dia é 19/03.
      const naSexta = detalheDoGet(await (await detalhe()).json());
      expect(naSexta.escalacaoNoProximoDia).toBe(false);
    } finally {
      await db.query(`DELETE FROM escalacoes WHERE grupo_id = $1 AND data = '2026-03-12'`, [
        cenario.grupoG,
      ]);
    }
  });

  it('SIM-08: a admin sem acesso ao financeiro também recebe os 2 campos', async () => {
    const json = (await (await detalhe(aberto.cenario.contaO, appTerca)).json()) as Record<
      string,
      unknown
    >;
    expect(json).toMatchObject({ proximoDiaDeJogo: '2026-03-12', escalacaoNoProximoDia: false });
  });
});
