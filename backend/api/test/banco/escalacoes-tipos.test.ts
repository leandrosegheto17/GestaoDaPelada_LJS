import type { Insertable, Selectable, Updateable } from 'kysely';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COLUNAS_ANULAVEIS,
  COLUNAS_TIPADAS,
  type Banco,
  type TabelaEscalacoes,
} from '../../src/infraestrutura/db/tipos.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Tipos Kysely de `escalacoes` (T26 da simulador; SIM-67): as colunas tipadas são todas as do banco migrado, com o tipo
 * do catálogo e as mesmas anuláveis; `grupo_id` e `data` não mudam num UPDATE (o `ON CONFLICT` só troca o resto).
 */

interface ColunaCatalogo {
  coluna: string;
  tipo: string;
  anulavel: boolean;
}

async function catalogo(url: string): Promise<ColunaCatalogo[]> {
  return comCliente(url, async (c) => {
    const r = await c.query<ColunaCatalogo>(
      `SELECT column_name AS coluna, udt_name AS tipo, is_nullable = 'YES' AS anulavel
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'escalacoes'`,
    );
    return r.rows;
  });
}

describe('tipos de escalacoes (SIM-67)', () => {
  it('SIM-67: as colunas tipadas são todas as do banco, com o tipo do catálogo', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        const doBanco = new Map(linhas.map((l) => [l.coluna, l.tipo]));
        expect(Object.keys(COLUNAS_TIPADAS.escalacoes).sort()).toEqual([...doBanco.keys()].sort());
        for (const [coluna, tipo] of Object.entries(COLUNAS_TIPADAS.escalacoes)) {
          expect(doBanco.get(coluna), `escalacoes.${coluna}`).toBe(tipo);
        }
      },
      { migrado: true },
    );
  });

  it('SIM-67: as anuláveis do tipo são as anuláveis do banco', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        const doBanco = linhas.filter((l) => l.anulavel).map((l) => l.coluna).sort();
        expect([...(COLUNAS_ANULAVEIS.escalacoes ?? [])].sort()).toEqual(doBanco);
      },
      { migrado: true },
    );
  });

  it('SIM-67: gravável, com grupo e data fixos depois do INSERT', () => {
    expectTypeOf<Banco['escalacoes']>().toEqualTypeOf<TabelaEscalacoes>();

    expectTypeOf<Selectable<TabelaEscalacoes>['composicao']>().toEqualTypeOf<unknown>();
    expectTypeOf<Selectable<TabelaEscalacoes>['k']>().toEqualTypeOf<number | null>();
    expectTypeOf<Selectable<TabelaEscalacoes>['data']>().toEqualTypeOf<string>();

    expectTypeOf<Insertable<TabelaEscalacoes>['composicao']>().toEqualTypeOf<string>();
    expectTypeOf<Insertable<TabelaEscalacoes>['grupo_id']>().toEqualTypeOf<string>();

    expectTypeOf<Updateable<TabelaEscalacoes>>().toHaveProperty('composicao');
    expectTypeOf<Updateable<TabelaEscalacoes>>().toHaveProperty('confirmada_em');
    expectTypeOf<Updateable<TabelaEscalacoes>>().not.toHaveProperty('grupo_id');
    expectTypeOf<Updateable<TabelaEscalacoes>>().not.toHaveProperty('data');
  });
});
