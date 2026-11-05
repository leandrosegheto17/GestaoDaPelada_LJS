import { Buffer } from 'node:buffer';
import type { MensagemAviso } from '@pelada/contrato/fila-avisos';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { filaMemoria, type FilaAvisos, type FilaMemoria } from '../../src/infraestrutura/fila/avisos.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Gatilho do aviso de ranking nas partidas (notificacoes T21; NOT-20 a NOT-23), com o app real como `pelada_app`, o
 * relógio fixo em 14/03/2026 e a fila em memória no binding `FILA_AVISOS`. A tarefa do `aposCommit` roda no
 * `waitUntil` do contexto falso, esperado antes de olhar a fila. O `afterEach` apaga as partidas novas de G.
 */

let aberto: CenarioGruposAberto;
let fila: FilaMemoria;

const AGORA = '2026-03-14T15:00:00Z';
const DATA = '2026-03-12';
const DATA_DO_CENARIO = '2026-01-08';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(metodo: string, caminho: string, corpo?: unknown, filaDoEnv: FilaAvisos = fila): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}`,
  });
  const ctx = contextoFalso();
  const env: Env = envAcesso(aberto.url, { FILA_AVISOS: filaDoEnv });
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}${caminho}`,
    { method: metodo, headers, ...(corpo === undefined ? {} : { body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }) },
    env,
    ctx,
  );
  await ctx.esperar();
  return r;
}

function corpoDaPartida(data: string) {
  return { data, choveu: false, marcacoes: [{ jogadorId: aberto.cenario.idsG.jogadorAtivo, situacao: 'presente' }] };
}

async function partidasNaData(data: string): Promise<number> {
  const r = await aberto.db.query('SELECT 1 FROM partidas WHERE grupo_id = $1 AND data = $2', [aberto.cenario.grupoG, data]);
  return r.rowCount ?? 0;
}

function esperado(data: string): MensagemAviso {
  return {
    tipo: 'ranking',
    grupoId: aberto.cenario.grupoG,
    dataPartida: data,
    criadoEm: new Date(AGORA).toISOString(),
    aposId: '0',
    tentativa: 1,
  };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  fila = filaMemoria();
  await reativar(aberto.db, aberto.cenario.grupoG);
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND id <> $2', [
    aberto.cenario.grupoG,
    aberto.cenario.idsG.partida,
  ]);
});

describe('aviso de ranking nas partidas', () => {
  it('NOT-20: POST 201 enfileira uma mensagem com o grupo e a data, depois do commit', async () => {
    const r = await pedir('POST', '/partidas', corpoDaPartida(DATA));
    expect(r.status).toBe(201);
    expect(fila.enviadas).toEqual([{ corpo: esperado(DATA) }]);
    expect(await partidasNaData(DATA)).toBe(1);
  });

  it('NOT-20: PUT 200 enfileira uma mensagem com o grupo e a data', async () => {
    const r = await pedir('PUT', `/partidas/${DATA_DO_CENARIO}`, corpoDaPartida(DATA_DO_CENARIO));
    expect(r.status).toBe(200);
    expect(fila.enviadas).toEqual([{ corpo: esperado(DATA_DO_CENARIO) }]);
  });

  it('NOT-20: a mensagem só é enfileirada quando a partida já é visível fora da transação', async () => {
    let visivel: number | null = null;
    const espia: FilaAvisos = {
      send: async (corpo, opcoes) => {
        visivel = await partidasNaData(DATA); // outra conexão: a do superusuário do cenário
        await fila.send(corpo, opcoes);
      },
    };
    const r = await pedir('POST', '/partidas', corpoDaPartida(DATA), espia);
    expect(r.status).toBe(201);
    expect(visivel).toBe(1);
  });

  it('NOT-21: 409 de data repetida não enfileira', async () => {
    const r = await pedir('POST', '/partidas', corpoDaPartida(DATA_DO_CENARIO));
    expect(r.status).toBe(409);
    expect(fila.enviadas).toEqual([]);
  });

  it('NOT-21: 422 de corpo inválido não enfileira, no POST e no PUT', async () => {
    const semMarcacao = { data: DATA, choveu: false, marcacoes: [{ jogadorId: 'nao-e-uuid', situacao: 'presente' }] };
    expect((await pedir('POST', '/partidas', semMarcacao)).status).toBe(422);
    expect((await pedir('PUT', `/partidas/${DATA_DO_CENARIO}`, corpoDaPartida(DATA))).status).toBe(422);
    expect((await pedir('POST', '/partidas', '{')).status).toBe(422);
    expect(fila.enviadas).toEqual([]);
    expect(await partidasNaData(DATA)).toBe(0);
  });

  it('NOT-22: com a fila que lança, a resposta e a partida gravada são as mesmas', async () => {
    const quebrada: FilaAvisos = {
      send: async () => {
        throw new Error('fila fora do ar');
      },
    };
    const comFila = await pedir('POST', '/partidas', corpoDaPartida(DATA));
    const corpoComFila = await comFila.json();
    await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND data = $2', [aberto.cenario.grupoG, DATA]);

    const semFila = await pedir('POST', '/partidas', corpoDaPartida(DATA), quebrada);
    expect(semFila.status).toBe(201);
    // `alteradaEm` é o instante da gravação de cada uma; o resto da resposta é igual.
    const semInstante = ({ alteradaEm: _a, ...resto }: Record<string, unknown>) => resto;
    expect(semInstante((await semFila.json()) as Record<string, unknown>)).toEqual(
      semInstante(corpoComFila as Record<string, unknown>),
    );
    expect(await partidasNaData(DATA)).toBe(1);
  });

  it('NOT-23: DELETE 204 não enfileira', async () => {
    expect((await pedir('POST', '/partidas', corpoDaPartida(DATA))).status).toBe(201);
    fila = filaMemoria();
    const r = await pedir('DELETE', `/partidas/${DATA}`);
    expect(r.status).toBe(204);
    expect(fila.enviadas).toEqual([]);
    expect(await partidasNaData(DATA)).toBe(0);
  });
});
