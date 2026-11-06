import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioGrupos,
  comoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `vinculos_travar(grupo, todos)` (migração `1793920000000_vinculos-travar`; FUN-12, ACE-39, ACE-40, GEL-22;
 * validação do financeiro, A-05, AD-129): função `SECURITY DEFINER` que trava vínculos sem passar pela policy
 * restritiva de UPDATE. Um teste por ramo da guarda: sem conta, conta sem vínculo no grupo, `p_todos` falso (só a
 * própria linha) e `p_todos` verdadeiro (todos os vínculos do grupo). Atores: C = criadora de G, O = admin de G,
 * B = conta só do grupo H.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

const travar = (conta: string | null, grupo: string, todos: boolean) => {
  const { db } = aberto;
  const consulta = async (d: typeof db) =>
    (
      await d.query<{ conta_id: string }>('SELECT conta_id FROM vinculos_travar($1, $2)', [
        grupo,
        todos,
      ])
    ).rows
      .map((l) => l.conta_id)
      .sort();
  return conta === null ? comoConta(db, '', consulta) : comoConta(db, conta, consulta);
};

describe('vinculos_travar', () => {
  it('ACE-39: sem conta no contexto não devolve nem trava nada (p_todos verdadeiro e falso)', async () => {
    const { grupoG } = aberto.cenario;
    expect(await travar(null, grupoG, true)).toEqual([]);
    expect(await travar(null, grupoG, false)).toEqual([]);
  });

  it('ACE-39: conta sem vínculo no grupo não recebe nada, nem a lista dos admins', async () => {
    const { contaB, grupoG } = aberto.cenario;
    expect(await travar(contaB, grupoG, true)).toEqual([]);
    expect(await travar(contaB, grupoG, false)).toEqual([]);
  });

  it('ACE-39: grupo inexistente não devolve nada, mesmo para a criadora', async () => {
    const { contaC } = aberto.cenario;
    expect(await travar(contaC, '00000000-0000-4000-8000-000000000000', true)).toEqual([]);
  });

  it('ACE-40: p_todos falso devolve só o vínculo da própria conta', async () => {
    const { contaC, contaO, grupoG } = aberto.cenario;
    expect(await travar(contaO, grupoG, false)).toEqual([contaO]);
    expect(await travar(contaC, grupoG, false)).toEqual([contaC]);
  });

  it('ACE-40: p_todos verdadeiro devolve todos os vínculos do grupo, só de G', async () => {
    const { contaC, contaO, grupoG, grupoH, contaB } = aberto.cenario;
    expect(await travar(contaC, grupoG, true)).toEqual([contaC, contaO].sort());
    expect(await travar(contaB, grupoH, true)).toContain(contaB);
    expect(await travar(contaB, grupoH, true)).not.toContain(contaC);
  });

  it('GEL-22: devolve só ids de conta (uma coluna) e EXECUTE é só do pelada_app', async () => {
    const { db, contaC, grupoG } = {
      db: aberto.db,
      contaC: aberto.cenario.contaC,
      grupoG: aberto.cenario.grupoG,
    };
    const colunas = await comoConta(db, contaC, async (d) => {
      const r = await d.query('SELECT * FROM vinculos_travar($1, true)', [grupoG]);
      return r.fields.map((f) => f.name);
    });
    expect(colunas).toEqual(['conta_id']);
    const privilegios = await db.query<{ publico: boolean; app: boolean }>(
      `SELECT has_function_privilege('public', 'vinculos_travar(uuid, boolean)', 'EXECUTE') AS publico,
              has_function_privilege('pelada_app', 'vinculos_travar(uuid, boolean)', 'EXECUTE') AS app`,
    );
    expect(privilegios.rows[0]).toEqual({ publico: false, app: true });
  });
});
