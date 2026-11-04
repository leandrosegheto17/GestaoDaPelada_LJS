import { describe, expect, test } from 'vitest';
import { type Cenario, comCenario, comoApp, type Contexto } from './apoio.ts';
import { CASOS_DA_MATRIZ, type CasoDaMatriz } from './matriz.ts';

async function chaves(cen: Cenario, caso: CasoDaMatriz, ctx: Contexto): Promise<string[]> {
  return comoApp(cen.c, ctx, async () =>
    (
      await cen.c.query<{ k: string }>(`select "${caso.coluna}"::text as k from "${caso.tabela}"`)
    ).rows.map((r) => r.k),
  );
}

/** Problemas de leitura da tabela nos três contextos; lista vazia = isolamento correto (FUN-13). */
export async function verificarLeitura(cen: Cenario, caso: CasoDaMatriz): Promise<string[]> {
  const { tabela } = caso;
  if (caso.leitura === 'sem-grant') {
    const erro = await chaves(cen, caso, { contaId: cen.A.contaId }).catch((e: Error) => e);
    return erro instanceof Error && /permission denied for table/.test(erro.message)
      ? []
      : [`${tabela}: esperava erro de permissão e veio ${String(erro)}`];
  }
  const problemas: string[] = [];
  const deA = await chaves(cen, caso, { contaId: cen.A.contaId });
  const deB = await chaves(cen, caso, { contaId: cen.B.contaId });
  const semVinculo = await chaves(cen, caso, { contaId: cen.semVinculo });
  if (deA.length === 0 || deA.some((k) => k !== cen.A.grupoId))
    problemas.push(`${tabela}: a conta A não leu só o grupo A`);
  if (deB.length === 0 || deB.some((k) => k !== cen.B.grupoId))
    problemas.push(`${tabela}: a conta B não leu só o grupo B`);
  if (semVinculo.length !== 0)
    problemas.push(`${tabela}: a conta sem vínculo leu ${semVinculo.length} linha(s)`);
  return problemas;
}

describe('matriz de leitura por conta', () => {
  test('FUN-13: cada tabela da matriz isola a leitura por conta (A só A, B só B, sem vínculo zero)', async () => {
    await comCenario(async (cen) => {
      for (const caso of CASOS_DA_MATRIZ) {
        expect(await verificarLeitura(cen, caso), caso.tabela).toEqual([]);
      }
    });
  }, 180_000);

  test('FUN-13: tabela sem GRANT SELECT para pelada_app dá erro de permissão (eventos_uso, auditoria)', async () => {
    await comCenario(async (cen) => {
      for (const tabela of ['eventos_uso', 'auditoria']) {
        const erro = await chaves(
          cen,
          { tabela, coluna: 'grupo_id', leitura: 'rls' },
          { contaId: cen.A.contaId },
        ).catch((e: Error) => e);
        expect((erro as Error).message).toContain(`permission denied for table ${tabela}`);
      }
    });
  }, 120_000);

  test('FUN-13: um USING (true) colocado de propósito numa policy faz a verificação falhar', async () => {
    await comCenario(async (cen) => {
      await cen.c.query('alter policy jogadores_ler on jogadores using (true)');
      const caso = CASOS_DA_MATRIZ.find((k) => k.tabela === 'jogadores')!;
      const problemas = await verificarLeitura(cen, caso);
      expect(problemas.join('\n')).toContain('jogadores: a conta sem vínculo leu');
      expect(problemas.join('\n')).toContain('jogadores: a conta A não leu só o grupo A');
    });
  }, 120_000);
});
