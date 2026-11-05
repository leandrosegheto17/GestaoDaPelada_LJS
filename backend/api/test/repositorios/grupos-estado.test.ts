import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gruposEstado } from '../../src/infraestrutura/db/repositorios/grupos-estado.ts';
import { abrirCenarioGrupos, arquivar, NOME_G, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Editar, arquivar e reativar o grupo (T27; GEL-18, GEL-22 a GEL-24, GEL-28 a GEL-30, SEC-008), contra o cenário de
 * grupos (C criadora de G, O outra admin). A `pelada_app` só insere na auditoria, então os casos que conferem eventos
 * confirmam a transação e leem a auditoria como superusuário; o `beforeEach` devolve G ao estado do cenário.
 *
 * Casos limite: ativo → arquivado; arquivado → arquivado; arquivado → ativo; ativo → ativo; nome com caixa ou espaço
 * diferente; O pedindo; criadora removida.
 */

let aberto: CenarioGruposAberto;

const DADOS_G = { nome: NOME_G, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' } as const;

/** Eventos de auditoria de G com a ação, contados como superusuário. */
async function eventos(acao: string): Promise<Array<{ autor: string; resumo: Record<string, unknown> }>> {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE grupo_id = $1 AND acao = $2 ORDER BY momento, id`,
    [aberto.cenario.grupoG, acao],
  );
  return r.rows;
}

async function arquivadoEm(): Promise<Date | null> {
  const r = await aberto.db.query<{ arquivado_em: Date | null }>('SELECT arquivado_em FROM grupos WHERE id = $1', [
    aberto.cenario.grupoG,
  ]);
  return r.rows[0]?.arquivado_em ?? null;
}

/** Contagens do que o grupo tem, para provar que arquivar e reativar não apagam nada (GEL-28, GEL-30). */
async function retrato(): Promise<Record<string, unknown>> {
  const g = aberto.cenario.grupoG;
  const um = async (sql: string) => (await aberto.db.query(sql, [g])).rows;
  return {
    grupo: await um('SELECT nome, slug, dia_semana, frequencia, horario, criado_por FROM grupos WHERE id = $1'),
    vinculos: await um('SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id'),
    jogadores: await um('SELECT id, apelido FROM jogadores WHERE grupo_id = $1 ORDER BY id'),
    periodos: await um('SELECT id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id'),
    habilidades: await um('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem'),
    notas: await um('SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id'),
  };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await aberto.db.query(
    `UPDATE grupos SET nome = $2, dia_semana = 'quinta', frequencia = 'semanal', horario = '20:00' WHERE id = $1`,
    [aberto.cenario.grupoG, NOME_G],
  );
});

describe('gruposEstado.arquivar', () => {
  it('GEL-22: a criadora arquiva com o nome exato, e há grupo_arquivado com ela como autora', async () => {
    const { url, cenario } = aberto;
    const antes = (await eventos('grupo_arquivado')).length;
    const r = await comDb(url, cenario.contaC, (db) => gruposEstado.arquivar(db, cenario.grupoG, NOME_G), {
      confirmar: true,
    });
    expect(r).toEqual({ resultado: 'ok', mudou: true });
    expect(await arquivadoEm()).not.toBeNull();
    const depois = await eventos('grupo_arquivado');
    expect(depois).toHaveLength(antes + 1);
    expect(depois.at(-1)?.autor).toBe(cenario.contaC);
  });

  it.each(['pelada de quinta', ' Pelada de Quinta', 'Pelada de Quinta ', 'Pelada  de Quinta', ''])(
    'GEL-23: nome de confirmação "%s" dá nome_nao_confere e não arquiva',
    async (nome) => {
      const { url, cenario } = aberto;
      const antes = (await eventos('grupo_arquivado')).length;
      const r = await comDb(url, cenario.contaC, (db) => gruposEstado.arquivar(db, cenario.grupoG, nome), {
        confirmar: true,
      });
      expect(r).toEqual({ resultado: 'nome_nao_confere' });
      expect(await arquivadoEm()).toBeNull();
      expect(await eventos('grupo_arquivado')).toHaveLength(antes);
    },
  );

  it('GEL-24: O (admin que não criou) recebe so_quem_criou, mesmo com o nome certo, e nada muda', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaO, (db) => gruposEstado.arquivar(db, cenario.grupoG, NOME_G), {
      confirmar: true,
    });
    expect(r).toEqual({ resultado: 'so_quem_criou' });
    expect(await arquivadoEm()).toBeNull();
  });

  it('GEL-24: O recebe so_quem_criou antes da conferência do nome', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaO, (db) => gruposEstado.arquivar(db, cenario.grupoG, 'outro nome'));
    expect(r).toEqual({ resultado: 'so_quem_criou' });
  });

  it('GEL-29: arquivar o já arquivado responde ok sem gravar nem auditar', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const quando = await arquivadoEm();
    const antes = (await eventos('grupo_arquivado')).length;
    const r = await comDb(url, cenario.contaC, (db) => gruposEstado.arquivar(db, cenario.grupoG, NOME_G), {
      confirmar: true,
    });
    expect(r).toEqual({ resultado: 'ok', mudou: false });
    expect(await arquivadoEm()).toEqual(quando);
    expect(await eventos('grupo_arquivado')).toHaveLength(antes);
  });

  it('GEL-30: arquivar não apaga nenhum dado do grupo', async () => {
    const { url, cenario } = aberto;
    const antes = await retrato();
    await comDb(url, cenario.contaC, (db) => gruposEstado.arquivar(db, cenario.grupoG, NOME_G), { confirmar: true });
    expect(await retrato()).toEqual(antes);
  });

  it('GEL-24: a criadora removida do grupo recebe nao_encontrado', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaC, async (db) => {
      await sql`DELETE FROM vinculos_admin WHERE grupo_id = ${cenario.grupoG} AND conta_id = ${cenario.contaC}`.execute(db);
      return gruposEstado.arquivar(db, cenario.grupoG, NOME_G);
    });
    expect(r).toEqual({ resultado: 'nao_encontrado' });
  });

  it('GEL-25: grupo que a RLS não mostra (conta sem vínculo) dá nao_encontrado', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaB, (db) => gruposEstado.arquivar(db, cenario.grupoG, NOME_G));
    expect(r).toEqual({ resultado: 'nao_encontrado' });
  });
});

describe('gruposEstado.reativar', () => {
  it('GEL-28: a criadora reativa; tudo continua como estava, e há grupo_reativado', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const antes = await retrato();
    const eventosAntes = (await eventos('grupo_reativado')).length;
    const r = await comDb(url, cenario.contaC, (db) => gruposEstado.reativar(db, cenario.grupoG), { confirmar: true });
    expect(r).toEqual({ resultado: 'ok', mudou: true });
    expect(await arquivadoEm()).toBeNull();
    expect(await retrato()).toEqual(antes);
    const depois = await eventos('grupo_reativado');
    expect(depois).toHaveLength(eventosAntes + 1);
    expect(depois.at(-1)?.autor).toBe(cenario.contaC);
  });

  it('GEL-29: reativar o ativo responde ok sem gravar nem auditar', async () => {
    const { url, cenario } = aberto;
    const antes = (await eventos('grupo_reativado')).length;
    const r = await comDb(url, cenario.contaC, (db) => gruposEstado.reativar(db, cenario.grupoG), { confirmar: true });
    expect(r).toEqual({ resultado: 'ok', mudou: false });
    expect(await eventos('grupo_reativado')).toHaveLength(antes);
  });

  it('GEL-25: O não reativa o arquivado: a RLS não o mostra (nao_encontrado) e ele continua arquivado', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await comDb(url, cenario.contaO, (db) => gruposEstado.reativar(db, cenario.grupoG), { confirmar: true });
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect(await arquivadoEm()).not.toBeNull();
  });

  it('GEL-24: com G ativo, O que pede reativar recebe so_quem_criou', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaO, (db) => gruposEstado.reativar(db, cenario.grupoG));
    expect(r).toEqual({ resultado: 'so_quem_criou' });
  });
});

describe('gruposEstado.editar', () => {
  it('GEL-18: grava os dados novos', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaO,
      (db) => gruposEstado.editar(db, cenario.grupoG, { nome: 'Pelada Renomeada', diaSemana: 'sexta', frequencia: 'mensal', horario: '07:15' }),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', mudou: true });
    const g = await aberto.db.query(
      `SELECT nome, dia_semana, frequencia, to_char(horario, 'HH24:MI') AS horario, slug FROM grupos WHERE id = $1`,
      [cenario.grupoG],
    );
    expect(g.rows[0]).toMatchObject({ nome: 'Pelada Renomeada', dia_semana: 'sexta', frequencia: 'mensal', horario: '07:15' });
    // GEL-16: o slug não muda ao renomear.
    expect(g.rows[0]?.slug).toBe(cenario.slugG);
  });

  it('SEC-008: grupo_editado traz só os nomes dos campos alterados, sem valores', async () => {
    const { url, cenario } = aberto;
    const antes = (await eventos('grupo_editado')).length;
    await comDb(url, cenario.contaO, (db) => gruposEstado.editar(db, cenario.grupoG, { ...DADOS_G, nome: 'Outro Nome', horario: '21:00' }), {
      confirmar: true,
    });
    const depois = await eventos('grupo_editado');
    expect(depois).toHaveLength(antes + 1);
    expect(depois.at(-1)?.autor).toBe(cenario.contaO);
    expect(depois.at(-1)?.resumo).toEqual({ campos: ['nome', 'horario'] });
    expect(JSON.stringify(depois.at(-1)?.resumo)).not.toContain('Outro Nome');
  });

  it('SEC-008: edição que falha não deixa evento', async () => {
    const { url, cenario } = aberto;
    const antes = (await eventos('grupo_editado')).length;
    await expect(
      comDb(
        url,
        cenario.contaO,
        async (db) => {
          await gruposEstado.editar(db, cenario.grupoG, { ...DADOS_G, nome: 'Nome Antes da Falha' });
          throw new Error('falha forçada depois da edição');
        },
        { confirmar: true },
      ),
    ).rejects.toThrow('falha forçada');
    expect(await eventos('grupo_editado')).toHaveLength(antes);
    const g = await aberto.db.query('SELECT nome FROM grupos WHERE id = $1', [cenario.grupoG]);
    expect(g.rows[0]?.nome).toBe(NOME_G);
  });

  it('SEC-008: sem nenhum campo alterado, nada é gravado nem auditado', async () => {
    const { url, cenario } = aberto;
    const antes = (await eventos('grupo_editado')).length;
    const r = await comDb(url, cenario.contaC, (db) => gruposEstado.editar(db, cenario.grupoG, DADOS_G), { confirmar: true });
    expect(r).toEqual({ resultado: 'ok', mudou: false });
    expect(await eventos('grupo_editado')).toHaveLength(antes);
  });

  it('GEL-21: sem vínculo, nao_encontrado e nada muda', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaB, (db) => gruposEstado.editar(db, cenario.grupoG, { ...DADOS_G, nome: 'Invasão' }), {
      confirmar: true,
    });
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    const g = await aberto.db.query('SELECT nome FROM grupos WHERE id = $1', [cenario.grupoG]);
    expect(g.rows[0]?.nome).toBe(NOME_G);
  });
});
