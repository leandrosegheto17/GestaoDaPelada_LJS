import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plano } from '../../src/infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import {
  abrirCenarioGrupos,
  criarGrupoComoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório do plano (planos-e-cobranca T20; PLA-07, PLA-17), como `pelada_app` contra o cenário de grupos: C cria
 * G (e G2, criado aqui), O é admin convidada só de G, B só vê H. G tem 2 períodos abertos e a assinatura cancelada
 * `sub_g` com `pago_ate` 2026-01-05 (cenário da T12).
 */

let aberto: CenarioGruposAberto;
let g2: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  g2 = (
    await criarGrupoComoConta(
      aberto.db,
      aberto.cenario.contaC,
      'Pelada de Sábado',
      'pelada-de-sabado-t20',
    )
  ).id;
});

afterAll(async () => {
  await aberto?.fechar();
});

function comoConta<T>(conta: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, conta, fn);
}

function comoSlug<T>(slug: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return comDb(aberto.url, null, async (db) => {
    await sql`SELECT set_config('app.slug_publico', ${slug}, true)`.execute(db);
    return fn(db);
  });
}

describe('plano.ler', () => {
  it('PLA-07: a criadora lê os dados do plano de G no formato do domínio', async () => {
    const { cenario } = aberto;
    const dados = await comoConta(cenario.contaC, (db) => plano.ler(db, cenario.grupoG));
    expect(dados).toEqual({
      situacaoComercial: expect.stringMatching(
        /^(uso_proprio|trial|ativo|inadimplente|cancelado)$/,
      ),
      trialInicio:
        dados?.situacaoComercial === 'trial' ? expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) : null,
      pagoAte: '2026-01-05',
      criadoPor: cenario.contaC,
      criadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
      jogadoresAtivos: 2,
    });
  });

  it('PLA-07: plano.ler de grupo de outra conta devolve nulo', async () => {
    const { cenario } = aberto;
    expect(await comoConta(cenario.contaB, (db) => plano.ler(db, cenario.grupoG))).toBeNull();
  });

  it('PLA-07: grupo inexistente devolve nulo', async () => {
    const { cenario } = aberto;
    expect(
      await comoConta(cenario.contaC, (db) =>
        plano.ler(db, '00000000-0000-4000-8000-000000000000'),
      ),
    ).toBeNull();
  });

  it('PLA-07: no contexto do slug de G, lê G e não lê G2', async () => {
    const { cenario } = aberto;
    expect(await comoSlug(cenario.slugG, (db) => plano.ler(db, cenario.grupoG))).not.toBeNull();
    expect(await comoSlug(cenario.slugG, (db) => plano.ler(db, g2))).toBeNull();
  });
});

describe('plano.gruposDaCriadora', () => {
  it('PLA-17: gruposDaCriadora pela conta convidada devolve os grupos da criadora, do mais antigo ao mais novo', async () => {
    const { db, cenario } = aberto;
    const esperado = await db.query<{ id: string }>(
      'SELECT id FROM grupos WHERE criado_por = $1 AND arquivado_em IS NULL ORDER BY criado_em, id',
      [cenario.contaC],
    );
    const grupos = await comoConta(cenario.contaO, (db2) =>
      plano.gruposDaCriadora(db2, cenario.grupoG),
    );
    expect(grupos.map((g) => g.id)).toEqual(esperado.rows.map((l) => l.id));
    expect(grupos.map((g) => g.id)).toContain(g2);
    const doG2 = grupos.find((g) => g.id === g2);
    expect(doG2).toEqual({
      id: g2,
      criadoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
      situacaoComercial: expect.any(String),
      trialInicio:
        doG2?.situacaoComercial === 'trial' ? expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) : null,
      pagoAte: null,
    });
    // A ordem do texto de `criadoEm` é a do tempo (o desempate do excedente compara texto).
    const ordenados = [...grupos].sort((a, b) =>
      a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0,
    );
    expect(ordenados.map((g) => g.id)).toEqual(grupos.map((g) => g.id));
  });

  it('PLA-17: a conta B recebe lista vazia', async () => {
    const { cenario } = aberto;
    expect(
      await comoConta(cenario.contaB, (db) => plano.gruposDaCriadora(db, cenario.grupoG)),
    ).toEqual([]);
  });

  it('PLA-17: o contexto do slug recebe lista vazia', async () => {
    const { cenario } = aberto;
    expect(
      await comoSlug(cenario.slugG, (db) => plano.gruposDaCriadora(db, cenario.grupoG)),
    ).toEqual([]);
  });
});
