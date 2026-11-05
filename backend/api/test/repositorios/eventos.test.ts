import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eventos } from '../../src/infraestrutura/db/repositorios/eventos.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de eventos de uso (T33; PAR-127, PAR-132, PAR-155 a PAR-158), contra o cenário de grupos. G joga às
 * quintas, 20:00. 2026-10-15 é uma quinta; a semana dela vai de segunda 2026-10-12 a domingo 2026-10-18. Os eventos de
 * G do cenário saem antes de cada caso, para os momentos serem os do teste; os momentos estão em UTC (São Paulo é
 * UTC-3, sem horário de verão).
 *
 * Casos limite: domingo 23:30 em São Paulo (segunda em UTC); segunda 00:30 em São Paulo; exatamente 48 h; lançada na
 * segunda; o mesmo aparelho duas vezes; semana sem evento.
 */

const X = '3f9a2c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const Y = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await aberto.db.query('DELETE FROM eventos_uso WHERE grupo_id = $1', [aberto.cenario.grupoG]);
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM eventos_uso WHERE grupo_id = $1', [aberto.cenario.grupoG]);
});

/** Grava um evento de G como superusuário. */
async function evento(
  tipo: 'ranking_aberto' | 'pdf_exportado' | 'partida_lancada' | 'escalacao_confirmada',
  momentoUtc: string,
  extra: { dispositivo?: string; mes?: string; data?: string } = {},
): Promise<void> {
  await aberto.db.query(
    `INSERT INTO eventos_uso (grupo_id, tipo, momento, dispositivo_id, mes_exportado, data_partida)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [aberto.cenario.grupoG, tipo, momentoUtc, extra.dispositivo ?? null, extra.mes ?? null, extra.data ?? null],
  );
}

function comoC<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, aberto.cenario.contaC, fn);
}

describe('eventos.porSemana', () => {
  it('PAR-155: semanas da mais recente para a mais antiga, só as que têm evento, com cada contagem', async () => {
    const { cenario } = aberto;
    // Semana de 12 a 18/10.
    await evento('partida_lancada', '2026-10-17T22:00:00Z', { data: '2026-10-15' }); // sábado 19:00
    await evento('partida_lancada', '2026-10-12T13:00:00Z', { data: '2026-10-08' }); // segunda: fora das 48 h
    await evento('ranking_aberto', '2026-10-13T12:00:00Z', { dispositivo: X });
    await evento('ranking_aberto', '2026-10-14T12:00:00Z', { dispositivo: X });
    await evento('ranking_aberto', '2026-10-19T02:30:00Z', { dispositivo: Y }); // domingo 23:30 em São Paulo
    // Semana de 19 a 25/10.
    await evento('pdf_exportado', '2026-10-19T03:30:00Z', { mes: '2026-10' }); // segunda 00:30 em São Paulo
    // Semana de 21 a 27/09; a de 28/09 a 04/10 fica sem evento.
    await evento('pdf_exportado', '2026-09-22T15:00:00Z', { mes: '2026-09' });

    const r = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect(r).toEqual([
      {
        inicio: '2026-10-19',
        fim: '2026-10-25',
        aparelhosRanking: 0,
        pdfsExportados: 1,
        partidasLancadas: 0,
        partidasEm48h: 0,
        escalacoesConfirmadas: 0,
      },
      {
        inicio: '2026-10-12',
        fim: '2026-10-18',
        aparelhosRanking: 2,
        pdfsExportados: 0,
        partidasLancadas: 2,
        partidasEm48h: 1,
        escalacoesConfirmadas: 0,
      },
      {
        inicio: '2026-09-21',
        fim: '2026-09-27',
        aparelhosRanking: 0,
        pdfsExportados: 1,
        partidasLancadas: 0,
        partidasEm48h: 0,
        escalacoesConfirmadas: 0,
      },
    ]);
  });

  it('PAR-156: evento de domingo 23:30 em São Paulo (segunda em UTC) cai na semana do domingo', async () => {
    const { cenario } = aberto;
    await evento('ranking_aberto', '2026-10-19T02:30:00Z', { dispositivo: Y });
    const r = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect(r.map((s) => [s.inicio, s.fim])).toEqual([['2026-10-12', '2026-10-18']]);
  });

  it('PAR-158: quinta 20:00 lançada no sábado 19:00 conta em 48 h; lançada na segunda, não ("2 (1)")', async () => {
    const { cenario } = aberto;
    await evento('partida_lancada', '2026-10-17T22:00:00Z', { data: '2026-10-15' });
    await evento('partida_lancada', '2026-10-12T13:00:00Z', { data: '2026-10-08' });
    const [s] = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect([s?.partidasLancadas, s?.partidasEm48h]).toEqual([2, 1]);
  });

  it('PAR-158: exatamente 48 h depois da data mais o horário ainda conta; um minuto depois, não', async () => {
    const { cenario } = aberto;
    await evento('partida_lancada', '2026-10-24T23:00:00Z', { data: '2026-10-22' }); // sábado 20:00
    await evento('partida_lancada', '2026-10-24T23:01:00Z', { data: '2026-10-22' }); // sábado 20:01
    const [s] = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect([s?.partidasLancadas, s?.partidasEm48h]).toEqual([2, 1]);
  });

  it('PAR-157: dois ranking_aberto do mesmo aparelho contam 1', async () => {
    const { cenario } = aberto;
    await evento('ranking_aberto', '2026-10-13T12:00:00Z', { dispositivo: X });
    await evento('ranking_aberto', '2026-10-14T12:00:00Z', { dispositivo: X });
    const [s] = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect(s?.aparelhosRanking).toBe(1);
  });

  // Simulador T30: `escalacoesConfirmadas` deixa de ser 0 fixo. Os casos acima não têm escalação e continuam
  // esperando 0, agora pela contagem real (autorizado, `## Autorizações`).
  it('SIM-70: duas confirmações da mesma data na semana contam 2; outra semana conta à parte', async () => {
    const { cenario } = aberto;
    await evento('escalacao_confirmada', '2026-10-13T12:00:00Z', { data: '2026-10-15' }); // terça
    await evento('escalacao_confirmada', '2026-10-14T12:00:00Z', { data: '2026-10-15' }); // quarta, a mesma data
    await evento('escalacao_confirmada', '2026-10-19T03:30:00Z', { data: '2026-10-22' }); // segunda 00:30 em SP
    await evento('ranking_aberto', '2026-10-13T12:00:00Z', { dispositivo: X });
    const r = await comoC((db) => eventos.porSemana(db, cenario.grupoG));
    expect(r.map((s) => [s.inicio, s.escalacoesConfirmadas, s.aparelhosRanking])).toEqual([
      ['2026-10-19', 1, 0],
      ['2026-10-12', 2, 1],
    ]);
  });

  it('SIM-70: semana só com escalação aparece, com o resto zerado ([LACUNA] da T30)', async () => {
    const { cenario } = aberto;
    await evento('escalacao_confirmada', '2026-10-13T12:00:00Z', { data: '2026-10-15' });
    expect(await comoC((db) => eventos.porSemana(db, cenario.grupoG))).toEqual([
      {
        inicio: '2026-10-12',
        fim: '2026-10-18',
        aparelhosRanking: 0,
        pdfsExportados: 0,
        partidasLancadas: 0,
        partidasEm48h: 0,
        escalacoesConfirmadas: 1,
      },
    ]);
  });

  it('PAR-155: sem evento, nenhuma semana; a conta de outro grupo não vê as semanas de G', async () => {
    const { cenario } = aberto;
    expect(await comoC((db) => eventos.porSemana(db, cenario.grupoG))).toEqual([]);
    await evento('pdf_exportado', '2026-10-19T15:00:00Z', { mes: '2026-10' });
    expect(await comDb(aberto.url, cenario.contaB, (db) => eventos.porSemana(db, cenario.grupoG))).toEqual([]);
  });
});

describe('eventos.aparelhosDaSemana', () => {
  it('PAR-132: aparelhos distintos com ranking_aberto na semana de hoje', async () => {
    const { cenario } = aberto;
    await evento('ranking_aberto', '2026-10-13T12:00:00Z', { dispositivo: X });
    await evento('ranking_aberto', '2026-10-14T12:00:00Z', { dispositivo: X });
    await evento('ranking_aberto', '2026-10-19T02:30:00Z', { dispositivo: Y });
    await evento('ranking_aberto', '2026-10-20T12:00:00Z', { dispositivo: X });
    expect(await comoC((db) => eventos.aparelhosDaSemana(db, cenario.grupoG, '2026-10-14'))).toBe(2);
    expect(await comoC((db) => eventos.aparelhosDaSemana(db, cenario.grupoG, '2026-10-18'))).toBe(2);
    expect(await comoC((db) => eventos.aparelhosDaSemana(db, cenario.grupoG, '2026-10-19'))).toBe(1);
    expect(await comoC((db) => eventos.aparelhosDaSemana(db, cenario.grupoG, '2026-11-02'))).toBe(0);
  });
});

describe('eventos.partidaLancada e registrarPublico', () => {
  it('PAR-127: partidaLancada grava o evento com a data da partida, com conta', async () => {
    const { cenario } = aberto;
    await comDb(aberto.url, cenario.contaC, (db) => eventos.partidaLancada(db, cenario.grupoG, '2026-10-15'), {
      confirmar: true,
    });
    const r = await aberto.db.query<{ data: string }>(
      `SELECT data_partida::text AS data FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'partida_lancada'`,
      [cenario.grupoG],
    );
    expect(r.rows).toEqual([{ data: '2026-10-15' }]);
  });

  it('PAR-127: registrarPublico grava com o slug do contexto e devolve true; com o slug de outro grupo, false', async () => {
    const { cenario } = aberto;
    const slugH = (await aberto.db.query<{ slug: string }>('SELECT slug FROM grupos WHERE id = $1', [cenario.grupoH]))
      .rows[0]?.slug;
    const resultado = await comDb(
      aberto.url,
      null,
      async (db) => {
        await sql`SELECT set_config('app.slug_publico', ${cenario.slugG}, true)`.execute(db);
        return [
          await eventos.registrarPublico(db, cenario.slugG, { tipo: 'ranking_aberto', dispositivoId: X }, '2026-10-15T23:00:00Z'),
          await eventos.registrarPublico(db, cenario.slugG, { tipo: 'pdf_exportado', mes: '2026-10' }, '2026-10-15T23:01:00Z'),
          await eventos.registrarPublico(db, slugH ?? '', { tipo: 'ranking_aberto', dispositivoId: X }, '2026-10-15T23:02:00Z'),
        ];
      },
      { confirmar: true },
    );
    expect(resultado).toEqual([true, true, false]);
    const r = await aberto.db.query<{ tipo: string; dispositivo_id: string | null; mes_exportado: string | null }>(
      'SELECT tipo, dispositivo_id, mes_exportado FROM eventos_uso WHERE grupo_id = $1 ORDER BY momento',
      [cenario.grupoG],
    );
    expect(r.rows).toEqual([
      { tipo: 'ranking_aberto', dispositivo_id: X, mes_exportado: null },
      { tipo: 'pdf_exportado', dispositivo_id: null, mes_exportado: '2026-10' },
    ]);
  });
});
