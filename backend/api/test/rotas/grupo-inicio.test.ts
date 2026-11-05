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
 * 12/03. O cenário de grupos tem a configuração de pesos de 2026-01-01 (não padrão) e uma partida em 2026-01-08. Os 2
 * campos do simulador ainda não vêm (são da rota da simulador): o schema do teste é o do contrato sem eles.
 */

let aberto: CenarioGruposAberto;

const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-03-13T15:00:00Z') });
const contratoSemSimulador = grupoDetalheComPartidas.omit({ proximoDiaDeJogo: true, escalacaoNoProximoDia: true });

/** O detalhe pelo contrato do GET sem os campos do simulador; o saldo (FIN-34) é da financeiro e sai antes. */
function detalheSemSimulador(json: unknown) {
  const { saldoFinanceiroCentavos: _saldo, ...resto } = json as Record<string, unknown>;
  return contratoSemSimulador.parse(resto);
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

async function detalhe(conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  const ctx = contextoFalso();
  const r = await app.request(`/api/grupos/${aberto.cenario.grupoG}`, { method: 'GET', headers }, envAcesso(aberto.url), ctx);
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
  await aberto.db.query(`DELETE FROM partidas WHERE grupo_id = $1 AND data = '2026-03-12'`, [aberto.cenario.grupoG]);
});

describe('GET /api/grupos/:grupoId com o início do grupo', () => {
  it('PAR-132: numa sexta, dataSugeridaPartida é a quinta anterior e partidaNaDataSugerida é falso sem partida', async () => {
    const r = await detalhe();
    expect(r.status).toBe(200);
    const g = detalheSemSimulador(await r.json());
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
    const g = detalheSemSimulador(await (await detalhe()).json());
    expect(g.partidaNaDataSugerida).toBe(true);
    expect(g.partidasNoMes).toBe(1);
  });

  it('PAR-132: a outra admin, sem acesso ao financeiro, recebe os 6 campos sem o saldo', async () => {
    const json = (await (await detalhe(aberto.cenario.contaO)).json()) as Record<string, unknown>;
    expect('saldoFinanceiroCentavos' in json).toBe(false);
    expect(detalheSemSimulador(json).dataSugeridaPartida).toBe('2026-03-12');
  });

  it('PAR-132: sem vínculo, 404', async () => {
    const r = await detalhe(aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});
