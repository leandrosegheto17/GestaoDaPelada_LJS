import type { Insertable, Selectable, Updateable } from 'kysely';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COLUNAS_ANULAVEIS,
  COLUNAS_TIPADAS,
  type Banco,
  type TabelaAssinaturas,
  type TabelaEventosAsaas,
} from '../../src/infraestrutura/db/tipos.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Tipos Kysely das tabelas do plano (planos-e-cobranca T19; PLA-30): as colunas tipadas de `assinaturas` e
 * `eventos_asaas` são todas as do banco migrado, com o tipo do catálogo e as mesmas anuláveis; e as duas são só
 * leitura nos tipos (a escrita é das funções `SECURITY DEFINER`, PLA-13).
 */

const PLANO = ['assinaturas', 'eventos_asaas'] as const;

interface ColunaCatalogo {
  tabela: string;
  coluna: string;
  tipo: string;
  anulavel: boolean;
}

async function catalogo(url: string): Promise<ColunaCatalogo[]> {
  return comCliente(url, async (c) => {
    const r = await c.query<ColunaCatalogo>(
      `SELECT table_name AS tabela, column_name AS coluna, udt_name AS tipo, is_nullable = 'YES' AS anulavel
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY ($1::text[])`,
      [[...PLANO]],
    );
    return r.rows;
  });
}

describe('tipos do plano (PLA-30)', () => {
  it('PLA-30: as colunas tipadas das 2 tabelas são todas as do banco, com o tipo do catálogo', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of PLANO) {
          const doBanco = new Map(
            linhas.filter((l) => l.tabela === tabela).map((l) => [l.coluna, l.tipo]),
          );
          expect(doBanco.size, tabela).toBeGreaterThan(0);
          expect(Object.keys(COLUNAS_TIPADAS[tabela]).sort(), tabela).toEqual(
            [...doBanco.keys()].sort(),
          );
          for (const [coluna, tipo] of Object.entries(COLUNAS_TIPADAS[tabela])) {
            expect(doBanco.get(coluna), `${tabela}.${coluna}`).toBe(tipo);
          }
        }
      },
      { migrado: true },
    );
  });

  it('PLA-30: as anuláveis do tipo são as anuláveis do banco nas 2 tabelas', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of PLANO) {
          const doBanco = linhas
            .filter((l) => l.tabela === tabela && l.anulavel)
            .map((l) => l.coluna)
            .sort();
          expect([...(COLUNAS_ANULAVEIS[tabela] ?? [])].sort(), tabela).toEqual(doBanco);
        }
      },
      { migrado: true },
    );
  });

  it('PLA-30: o valor da assinatura é inteiro em centavos (int4)', () => {
    expect(COLUNAS_TIPADAS.assinaturas.valor_centavos).toBe('int4');
  });

  it('PLA-13: as duas tabelas são só leitura nos tipos', () => {
    expectTypeOf<Banco['assinaturas']>().toEqualTypeOf<TabelaAssinaturas>();
    expectTypeOf<Banco['eventos_asaas']>().toEqualTypeOf<TabelaEventosAsaas>();
    expectTypeOf<Selectable<TabelaAssinaturas>['valor_centavos']>().toEqualTypeOf<number>();
    expectTypeOf<Selectable<TabelaAssinaturas>['pago_ate']>().toEqualTypeOf<string | null>();
    expectTypeOf<Insertable<TabelaAssinaturas>>().toEqualTypeOf<{}>();
    expectTypeOf<Updateable<TabelaAssinaturas>>().toEqualTypeOf<{}>();
    expectTypeOf<Insertable<TabelaEventosAsaas>>().toEqualTypeOf<{}>();
  });
});
