import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grupos } from '../../src/infraestrutura/db/repositorios/grupos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `grupos.criar` com a data e `grupos.ler` com os dados do início (T34; PAR-15, PAR-132), contra o cenário de grupos.
 * G joga às quintas e tem a partida de 2026-01-08 (quinta) e a configuração de 2026-01-01 do cenário, além da que a
 * `grupo_criar` gravou na data real (depois de 2026-01-10).
 *
 * Casos limite: dia de jogo hoje; sugerida com e sem partida; mês sem partida; uma configuração padrão ou duas;
 * configuração depois de hoje fora da vigente.
 */

const DADOS = {
  nome: 'Pelada do Início',
  diaSemana: 'quarta',
  frequencia: 'semanal',
  horario: '19:00',
} as const;

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('grupos.criar com a data', () => {
  it('PAR-15: o grupo criado pelo repositório tem os pesos padrão vigentes desde o hoje recebido', async () => {
    const { url, cenario } = aberto;
    const pesos = await comDb(url, cenario.contaB, async (db) => {
      const criado = await grupos.criar(db, DADOS, '2026-04-15');
      const detalhe = await grupos.ler(db, criado.id, '2026-04-15');
      return { vigente: detalhe?.pesosVigentesDesde, padrao: detalhe?.pesosPadrao };
    });
    expect(pesos).toEqual({ vigente: '2026-04-15', padrao: true });
  });
});

describe('grupos.ler com hoje', () => {
  it('PAR-132: grupo novo devolve partidasNoMes 0, pesosPadrao verdadeiro e aparelhosNaSemana 0', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaB, async (db) => {
      const criado = await grupos.criar(db, DADOS, '2026-04-15');
      return grupos.ler(db, criado.id, '2026-04-15');
    });
    expect(d).toMatchObject({
      dataSugeridaPartida: '2026-04-15',
      partidaNaDataSugerida: false,
      partidasNoMes: 0,
      pesosVigentesDesde: '2026-04-15',
      pesosPadrao: true,
      aparelhosNaSemana: 0,
    });
  });

  it('PAR-132: em G no sábado 2026-01-10, a sugerida é a quinta 2026-01-08, que tem partida', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaC, (db) =>
      grupos.ler(db, cenario.grupoG, '2026-01-10'),
    );
    expect(d).toMatchObject({
      dataSugeridaPartida: '2026-01-08',
      partidaNaDataSugerida: true,
      partidasNoMes: 1,
      pesosVigentesDesde: '2026-01-01',
      pesosPadrao: false,
    });
  });

  it('PAR-132: em G na quinta 2026-01-15, a sugerida é hoje, sem partida', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaC, (db) =>
      grupos.ler(db, cenario.grupoG, '2026-01-15'),
    );
    expect(d).toMatchObject({
      dataSugeridaPartida: '2026-01-15',
      partidaNaDataSugerida: false,
      partidasNoMes: 1,
    });
  });

  it('PAR-132: em fevereiro, G não tem partida no mês', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaC, (db) =>
      grupos.ler(db, cenario.grupoG, '2026-02-10'),
    );
    expect(d?.partidasNoMes).toBe(0);
  });

  it('PAR-132: aparelhos distintos com ranking_aberto na semana de hoje', async () => {
    const { url, db, cenario } = aberto;
    await db.query(
      `INSERT INTO eventos_uso (grupo_id, tipo, momento, dispositivo_id) VALUES
         ($1, 'ranking_aberto', '2026-01-06T12:00:00Z', '3f9a2c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'),
         ($1, 'ranking_aberto', '2026-01-07T12:00:00Z', '3f9a2c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'),
         ($1, 'ranking_aberto', '2026-01-08T12:00:00Z', '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f')`,
      [cenario.grupoG],
    );
    try {
      const d = await comDb(url, cenario.contaC, (dbApp) =>
        grupos.ler(dbApp, cenario.grupoG, '2026-01-10'),
      );
      expect(d?.aparelhosNaSemana).toBe(2);
    } finally {
      await db.query(`DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'ranking_aberto'`, [
        cenario.grupoG,
      ]);
    }
  });

  it('PAR-132: sem hoje, ler devolve só o detalhe da grupos-e-elenco, sem os campos do início', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaC, (db) => grupos.ler(db, cenario.grupoG));
    expect(d).not.toHaveProperty('dataSugeridaPartida');
    expect(d).not.toHaveProperty('aparelhosNaSemana');
  });

  it('SIM-08: grupo de quinta numa terça com escalação da quinta: escalacaoNoProximoDia verdadeiro; sem, falso', async () => {
    const { url, db, cenario } = aberto;
    // 2026-03-03 é terça; a quinta seguinte é 2026-03-05. Escalação gravada como owner, apagada no finally.
    const antes = await comDb(url, cenario.contaC, (dbApp) =>
      grupos.ler(dbApp, cenario.grupoG, '2026-03-03'),
    );
    expect(antes).toMatchObject({ proximoDiaDeJogo: '2026-03-05', escalacaoNoProximoDia: false });
    await db.query(
      `INSERT INTO escalacoes (grupo_id, data, formato, n, k, composicao, confirmada_por, confirmada_em)
       VALUES ($1, '2026-03-05', 'dois_times', 7, 2, '{"times":[]}'::jsonb, $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
    try {
      const d = await comDb(url, cenario.contaC, (dbApp) =>
        grupos.ler(dbApp, cenario.grupoG, '2026-03-03'),
      );
      expect(d).toMatchObject({ proximoDiaDeJogo: '2026-03-05', escalacaoNoProximoDia: true });
      // Escalação de outra data não conta para o próximo dia.
      const quintaSeguinte = await comDb(url, cenario.contaC, (dbApp) =>
        grupos.ler(dbApp, cenario.grupoG, '2026-03-06'),
      );
      expect(quintaSeguinte).toMatchObject({
        proximoDiaDeJogo: '2026-03-12',
        escalacaoNoProximoDia: false,
      });
    } finally {
      await db.query(`DELETE FROM escalacoes WHERE grupo_id = $1 AND data = '2026-03-05'`, [
        cenario.grupoG,
      ]);
    }
  });

  it('SIM-08: na própria quinta, o próximo dia de jogo é hoje', async () => {
    const { url, cenario } = aberto;
    const d = await comDb(url, cenario.contaC, (db) =>
      grupos.ler(db, cenario.grupoG, '2026-03-05'),
    );
    expect(d?.proximoDiaDeJogo).toBe('2026-03-05');
  });

  it('PAR-132: a conta de outro grupo recebe nulo', async () => {
    const { url, cenario } = aberto;
    expect(
      await comDb(url, cenario.contaB, (db) => grupos.ler(db, cenario.grupoG, '2026-01-10')),
    ).toBeNull();
  });
});
