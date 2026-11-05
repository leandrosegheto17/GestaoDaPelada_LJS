import {
  sql,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
} from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { historico } from '../../src/infraestrutura/db/repositorios/historico.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `historico.carregar` (T27; PAR-62, PAR-77; AD-035), como `pelada_app` contra o cenário de grupos (G com C, O e o
 * elenco; H só de B). Um plugin do Kysely conta as consultas e guarda o SQL de cada uma.
 */

const ATE = '2026-11-05';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Conta as consultas que passam pelo Kysely e guarda o texto de cada uma (SQL cru do `sql` do Kysely). */
class Espiao implements KyselyPlugin {
  readonly consultas: string[] = [];

  transformQuery(args: PluginTransformQueryArgs) {
    const no = args.node as { kind: string; sqlFragments?: readonly string[] };
    this.consultas.push(no.kind === 'RawNode' ? (no.sqlFragments ?? []).join('?') : no.kind);
    return args.node;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

function comoConta<T>(conta: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, conta, fn);
}

/** Só o slug do contexto, sem conta: o `comDb` abre sem conta e aqui se põe o slug, na mesma transação. */
function comoSlug<T>(slug: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, null, async (db) => {
    await sql`SELECT set_config('app.slug_publico', ${slug}, true)`.execute(db);
    return fn(db);
  });
}

describe('historico.carregar', () => {
  it('PAR-62: traz o histórico de G para a admin, em 4 consultas', async () => {
    const { cenario } = aberto;
    const espiao = new Espiao();
    const h = await comoConta(cenario.contaC, (db) =>
      historico.carregar(db.withPlugin(espiao), cenario.grupoG, ATE),
    );
    expect(espiao.consultas).toHaveLength(4);
    expect(h.jogadores.map((j) => j.id).sort()).toEqual(
      [
        cenario.idsG.jogadorAtivo,
        cenario.idsG.jogadorInativo,
        cenario.idsG.jogadorHistorico,
      ].sort(),
    );
    expect(h.partidas.map((p) => p.id)).toContain(cenario.idsG.partida);
    expect(h.presencas).toContainEqual({
      partidaId: cenario.idsG.partida,
      jogadorId: cenario.idsG.jogadorHistorico,
      situacao: 'presente',
    });
    expect(h.configsPesos.length).toBeGreaterThan(0);
  });

  it('PAR-62: a admin de G pedindo H recebe o histórico vazio (a RLS decide)', async () => {
    const { cenario } = aberto;
    const h = await comoConta(cenario.contaC, (db) => historico.carregar(db, cenario.grupoH, ATE));
    expect(h).toEqual({ jogadores: [], partidas: [], presencas: [], configsPesos: [] });
  });

  it('PAR-62: o slug de G traz só G; com o id de H, nada', async () => {
    const { cenario } = aberto;
    const deG = await comoSlug(cenario.slugG, (db) => historico.carregar(db, cenario.grupoG, ATE));
    expect(deG.jogadores).toHaveLength(3);
    const deH = await comoSlug(cenario.slugG, (db) => historico.carregar(db, cenario.grupoH, ATE));
    expect(deH).toEqual({ jogadores: [], partidas: [], presencas: [], configsPesos: [] });
  });

  it('PAR-62: períodos de cada jogador em ordem de início, com o período encerrado', async () => {
    const { cenario } = aberto;
    const h = await comoConta(cenario.contaC, (db) => historico.carregar(db, cenario.grupoG, ATE));
    const inativo = h.jogadores.find((j) => j.id === cenario.idsG.jogadorInativo);
    expect(inativo?.periodos).toEqual([
      expect.objectContaining({ inicio: '2025-03-01', fim: '2025-12-31' }),
    ]);
    const ativo = h.jogadores.find((j) => j.id === cenario.idsG.jogadorAtivo);
    expect(ativo?.periodos).toEqual([expect.objectContaining({ inicio: '2026-01-01', fim: null })]);
  });

  it('PAR-62: partidas depois de `ate` e as presenças delas ficam de fora', async () => {
    const { cenario } = aberto;
    const h = await comoConta(cenario.contaC, (db) =>
      historico.carregar(db, cenario.grupoG, '2026-01-07'),
    );
    expect(h.partidas).toEqual([]);
    expect(h.presencas).toEqual([]);
  });

  it('PAR-77: nenhuma consulta seleciona telefone, posição nem notas', async () => {
    const { cenario } = aberto;
    const espiao = new Espiao();
    await comoConta(cenario.contaC, (db) =>
      historico.carregar(db.withPlugin(espiao), cenario.grupoG, ATE),
    );
    const texto = espiao.consultas.join('\n');
    expect(texto).not.toMatch(/telefone|posicao|\bnotas\b/i);
  });

  it('PAR-62: o expulso com chuva lê expulso_com_chuva e o sem chuva lê expulso', async () => {
    const { cenario } = aberto;
    const h = await comDb(aberto.url, cenario.contaC, async (db) => {
      await sql`
        INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                                  lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
        VALUES (${cenario.grupoG}, '2026-03-01', 3, 4, 1, 2, -2, -5, ${cenario.contaC}, now())`.execute(
        db,
      );
      return historico.carregar(db, cenario.grupoG, ATE);
    });
    expect(h.configsPesos.find((c) => c.vigenteDesde === '2026-03-01')).toEqual({
      vigenteDesde: '2026-03-01',
      presencaSemChuva: 3,
      presencaComChuva: 4,
      lesionadoSemChuva: 1,
      lesionadoComChuva: 2,
      expulsoSemChuva: -2,
      expulsoComChuva: -5,
    });
  });

  it('PAR-62: jogador sem início da pontuação gravado vem com inicioPontuacao indefinido', async () => {
    const { cenario } = aberto;
    const h = await comoConta(cenario.contaC, (db) => historico.carregar(db, cenario.grupoG, ATE));
    const semInicio = h.jogadores.filter((j) => j.inicioPontuacao === undefined);
    expect(semInicio.length).toBeGreaterThan(0);
    expect(
      h.jogadores.every(
        (j) => j.inicioPontuacao === undefined || /^\d{4}-\d{2}-\d{2}$/.test(j.inicioPontuacao),
      ),
    ).toBe(true);
  });
});
