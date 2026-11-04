import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { type Cenario, comCenario, comoApp, inserirLinha } from './apoio.ts';
import { CASOS_DA_MATRIZ, type CasoDaMatriz } from './matriz.ts';

const BLOQUEADO = /row-level security|permission denied/;

/** Linhas do grupo A, lidas como superusuário (sai da role dentro da transação do comoApp). */
async function fotoDoGrupoA(cen: Cenario, caso: CasoDaMatriz): Promise<string[]> {
  await cen.c.query('reset role');
  const { rows } = await cen.c.query<{ j: string }>(
    `select to_jsonb(t)::text as j from "${caso.tabela}" t where "${caso.coluna}" = $1 order by 1`,
    [cen.A.grupoId],
  );
  await cen.c.query('set local role pelada_app');
  return rows.map((r) => r.j);
}

/** Roda `sql` como a conta B (savepoint, para o erro não abortar a transação) e devolve o erro, se houve. */
async function comoBTentar(
  cen: Cenario,
  caso: CasoDaMatriz,
  comando: () => Promise<unknown>,
): Promise<{ erro?: Error; depois: string[]; antes: string[] }> {
  return comoApp(cen.c, { contaId: cen.B.contaId }, async () => {
    const antes = await fotoDoGrupoA(cen, caso);
    await cen.c.query('savepoint tentativa');
    let erro: Error | undefined;
    try {
      await comando();
    } catch (e) {
      erro = e as Error;
      await cen.c.query('rollback to savepoint tentativa');
    }
    return { erro, antes, depois: await fotoDoGrupoA(cen, caso) };
  });
}

/** Problemas de escrita da conta B sobre o grupo A; lista vazia = isolamento correto (FUN-17). */
export async function verificarEscrita(cen: Cenario, caso: CasoDaMatriz): Promise<string[]> {
  const { tabela, coluna } = caso;
  const problemas: string[] = [];
  const confere = (
    rotulo: string,
    r: { erro?: Error; antes: string[]; depois: string[] },
    exigeErro: boolean,
  ) => {
    if (exigeErro && !(r.erro && BLOQUEADO.test(r.erro.message))) {
      problemas.push(`${tabela}: ${rotulo} não foi recusado (${r.erro?.message ?? 'sem erro'})`);
    }
    if (JSON.stringify(r.antes) !== JSON.stringify(r.depois)) {
      problemas.push(`${tabela}: ${rotulo} alterou o conteúdo do grupo A`);
    }
  };

  // INSERT no grupo A
  const extra: Record<string, string> =
    tabela === 'vinculos_admin' ? { conta_id: cen.B.contaId } : {};
  if (tabela === 'grupos') extra.criado_por = cen.B.contaId;
  if (tabela === 'grupos') extra.slug = `invasor-${randomUUID().slice(0, 8)}`;
  const idDoGrupo = tabela === 'grupos' ? randomUUID() : cen.A.grupoId;
  confere(
    'INSERT no grupo A',
    await comoBTentar(cen, caso, () => inserirLinha(cen.c, tabela, coluna, idDoGrupo, extra)),
    true,
  );

  // UPDATE sem WHERE: empurra toda linha visível para o grupo B (ou renomeia, em grupos)
  const set = tabela === 'grupos' ? `"nome" = 'invadido'` : `"${coluna}" = '${cen.B.grupoId}'`;
  confere(
    'UPDATE sem WHERE',
    await comoBTentar(cen, caso, () => cen.c.query(`update "${tabela}" set ${set}`)),
    false,
  );

  // UPDATE das linhas do próprio grupo B para o grupo A (WITH CHECK)
  if (tabela !== 'grupos') {
    confere(
      'UPDATE para o grupo A',
      await comoBTentar(cen, caso, () =>
        cen.c.query(`update "${tabela}" set "${coluna}" = $1 where "${coluna}" = $2`, [
          cen.A.grupoId,
          cen.B.grupoId,
        ]),
      ),
      true,
    );
  }

  // DELETE sem WHERE
  confere(
    'DELETE sem WHERE',
    await comoBTentar(cen, caso, () => cen.c.query(`delete from "${tabela}"`)),
    false,
  );
  // DELETE explícito do grupo A
  confere(
    'DELETE do grupo A',
    await comoBTentar(cen, caso, () =>
      cen.c.query(`delete from "${tabela}" where "${coluna}" = $1`, [cen.A.grupoId]),
    ),
    false,
  );
  return problemas;
}

describe('matriz de escrita por conta', () => {
  test('FUN-17: a conta B não escreve no grupo A em nenhuma tabela, por comando', async () => {
    await comCenario(async (cen) => {
      for (const caso of CASOS_DA_MATRIZ) {
        expect(await verificarEscrita(cen, caso), caso.tabela).toEqual([]);
      }
    });
  }, 300_000);

  // No UPDATE a policy de SELECT também vale para a linha nova (defesa em profundidade); no INSERT só o WITH CHECK barra.
  test('FUN-17: um WITH CHECK removido de propósito faz a verificação falhar', async () => {
    await comCenario(async (cen) => {
      await cen.c.query('alter policy jogadores_inserir on jogadores with check (true)');
      const caso = CASOS_DA_MATRIZ.find((k) => k.tabela === 'jogadores')!;
      const problemas = await verificarEscrita(cen, caso);
      expect(problemas.join('\n')).toContain('jogadores: INSERT no grupo A não foi recusado');
    });
  }, 120_000);

  test('FUN-17: um USING (true) numa policy de escrita faz o UPDATE e o DELETE sem WHERE falharem', async () => {
    await comCenario(async (cen) => {
      await cen.c.query(
        'alter policy lancamentos_alterar on lancamentos using (true) with check (true)',
      );
      await cen.c.query('alter policy lancamentos_apagar on lancamentos using (true)');
      const caso = CASOS_DA_MATRIZ.find((k) => k.tabela === 'lancamentos')!;
      const problemas = (await verificarEscrita(cen, caso)).join('\n');
      expect(problemas).toContain('lancamentos: UPDATE sem WHERE alterou o conteúdo do grupo A');
      expect(problemas).toContain('lancamentos: DELETE sem WHERE alterou o conteúdo do grupo A');
    });
  }, 120_000);
});
