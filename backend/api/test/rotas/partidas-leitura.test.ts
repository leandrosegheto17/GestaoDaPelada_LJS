import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_MES,
  MENSAGEM_MES_FUTURO,
  partidaNova,
  partidasDoMes,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  criarGrupoComoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `GET …/partidas/nova?data=` e `GET …/partidas?mes=` (partidas-e-ranking T39; PAR-17 a PAR-21, PAR-37 a PAR-41), com
 * o app real como `pelada_app` e o relógio fixo no sábado 14/03/2026 (12h de São Paulo): a quinta anterior é 12/03.
 *
 * Cenário de grupos: G joga às quintas; Toninho e Bira ativos desde 2026-01-01, Zé Inativo de 2025-03-01 a
 * 2025-12-31; uma partida em 2026-01-08 com Bira presente. O `beforeAll` acrescenta Álvaro (ativo desde 2026-01-01),
 * para a ordem sem acento, e um grupo S sem partida, para a navegação nula.
 */

let aberto: CenarioGruposAberto;
let grupoS: string;
let alvaro: string;

const HOJE = '2026-03-14';
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-14T15:00:00Z'),
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

async function pedir(
  caminho: string,
  conta = aberto.cenario.contaC,
  grupo = aberto.cenario.grupoG,
): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${grupo}${caminho}`,
    { method: 'GET', headers },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Álvaro', 'meia', $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoG, cenario.contaC],
  );
  alvaro = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`,
    [alvaro, cenario.grupoG],
  );
  grupoS = (await criarGrupoComoConta(db, cenario.contaC, 'Sem Partidas', 'sem-partidas')).id;
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('GET …/partidas/nova', () => {
  it('PAR-17: sem data, devolve a quinta anterior com os ativos ordenados pelo apelido sem acento, todos ausente', async () => {
    const r = await pedir('/partidas/nova');
    expect(r.status).toBe(200);
    const corpo = partidaNova.parse(await r.json());
    const { idsG } = aberto.cenario;
    expect(corpo).toEqual({
      data: '2026-03-12',
      dataSugerida: '2026-03-12',
      hoje: HOJE,
      choveu: false,
      preMarcadaPelaEscalacao: false,
      jogadores: [
        { id: alvaro, apelido: 'Álvaro', situacao: 'ausente' },
        { id: idsG.jogadorHistorico, apelido: 'Bira', situacao: 'ausente' },
        { id: idsG.jogadorAtivo, apelido: 'Toninho', situacao: 'ausente' },
      ],
    });
  });

  it('PAR-18: com data, devolve os ativos daquela data e mantém a dataSugerida', async () => {
    const corpo = partidaNova.parse(await (await pedir('/partidas/nova?data=2025-06-05')).json());
    expect(corpo.data).toBe('2025-06-05');
    expect(corpo.dataSugerida).toBe('2026-03-12');
    expect(corpo.jogadores).toEqual([
      { id: aberto.cenario.idsG.jogadorInativo, apelido: 'Zé Inativo', situacao: 'ausente' },
    ]);
  });

  it('PAR-18: data num dia que não é o do grupo é aceita (a sugerida é só sugestão)', async () => {
    const r = await pedir('/partidas/nova?data=2026-03-10');
    expect(r.status).toBe(200);
    expect(partidaNova.parse(await r.json()).data).toBe('2026-03-10');
  });

  it('PAR-20: hoje vale como data', async () => {
    const r = await pedir(`/partidas/nova?data=${HOJE}`);
    expect(r.status).toBe(200);
  });

  it.each(['2026-02-30', '2026-13-01', '14/03/2026', ''])(
    'PAR-19: data %j dá 422 "Informe uma data válida."',
    async (data) => {
      const r = await pedir(`/partidas/nova?data=${encodeURIComponent(data)}`);
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({
        codigo: 'dados_invalidos',
        mensagens: { data: MENSAGEM_DATA_INVALIDA },
      });
    },
  );

  it('PAR-20: data de amanhã dá "A data não pode ser no futuro."', async () => {
    const r = await pedir('/partidas/nova?data=2026-03-15');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { data: MENSAGEM_DATA_FUTURA } });
    expect(MENSAGEM_DATA_FUTURA).toBe('A data não pode ser no futuro.');
  });

  it('PAR-21: data já lançada dá 409 partida_ja_existe com a mensagem da data e dataExistente', async () => {
    const r = await pedir('/partidas/nova?data=2026-01-08');
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'Já existe uma partida em 08/01/2026.',
      codigo: 'partida_ja_existe',
      dataExistente: '2026-01-08',
    });
  });

  it('PAR-17: parâmetro desconhecido na consulta é recusado', async () => {
    const r = await pedir('/partidas/nova?dia=quinta');
    expect(r.status).toBe(422);
  });

  it('PAR-17: sem vínculo, 404', async () => {
    const r = await pedir('/partidas/nova', aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});

describe('GET …/partidas?mes', () => {
  it('PAR-37: mes=2026-01 devolve a partida de 08/01 com as contagens e a navegação', async () => {
    const r = await pedir('/partidas?mes=2026-01');
    expect(r.status).toBe(200);
    expect(partidasDoMes.parse(await r.json())).toEqual({
      mes: '2026-01',
      hoje: HOJE,
      navegacao: { mesAnterior: null, mesSeguinte: '2026-02' },
      partidas: [
        {
          data: '2026-01-08',
          choveu: false,
          contagem: { presentes: 1, lesionados: 0, expulsos: 0 },
        },
      ],
    });
  });

  it('PAR-38: sem mes, usa o mês de hoje', async () => {
    const corpo = partidasDoMes.parse(await (await pedir('/partidas')).json());
    expect(corpo.mes).toBe('2026-03');
    expect(corpo.partidas).toEqual([]);
  });

  it('PAR-41: no mês de hoje, mesSeguinte é nulo e mesAnterior é o mês passado', async () => {
    const corpo = partidasDoMes.parse(await (await pedir('/partidas?mes=2026-03')).json());
    expect(corpo.navegacao).toEqual({ mesAnterior: '2026-02', mesSeguinte: null });
  });

  it('PAR-41: grupo sem partida tem mesAnterior e mesSeguinte nulos', async () => {
    const corpo = partidasDoMes.parse(
      await (await pedir('/partidas', aberto.cenario.contaC, grupoS)).json(),
    );
    expect(corpo.navegacao).toEqual({ mesAnterior: null, mesSeguinte: null });
    expect(corpo.partidas).toEqual([]);
  });

  it.each(['2026-13', '2026-3', '03-2026', ''])(
    'PAR-39: mes %j dá 422 "Informe o mês como AAAA-MM."',
    async (mes) => {
      const r = await pedir(`/partidas?mes=${encodeURIComponent(mes)}`);
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ mensagens: { mes: MENSAGEM_MES } });
    },
  );

  it('PAR-40: mês seguinte ao de hoje dá "O mês não pode ser futuro."', async () => {
    const r = await pedir('/partidas?mes=2026-04');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { mes: MENSAGEM_MES_FUTURO } });
    expect(MENSAGEM_MES_FUTURO).toBe('O mês não pode ser futuro.');
  });

  it('PAR-37: sem vínculo, 404', async () => {
    const r = await pedir('/partidas?mes=2026-01', aberto.cenario.contaB);
    expect(r.status).toBe(404);
  });
});
