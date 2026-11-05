import type { Insertable, Selectable, Updateable } from 'kysely';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COLUNAS_ANULAVEIS,
  COLUNAS_TIPADAS,
  type Banco,
  type TabelaConfigFinanceira,
  type TabelaLancamentos,
  type TabelaPagamentosMes,
} from '../../src/infraestrutura/db/tipos.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Tipos Kysely das tabelas do financeiro (T11; FIN-13): as colunas tipadas das 3 tabelas são todas as do banco migrado,
 * com o tipo do catálogo (centavos em `int4`, datas em `date`) e as mesmas anuláveis; e as 3 são graváveis nos tipos.
 */

const FINANCEIRO = ['config_financeira', 'lancamentos', 'pagamentos_mes'] as const;

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
      [[...FINANCEIRO]],
    );
    return r.rows;
  });
}

describe('tipos do financeiro (FIN-13)', () => {
  it('FIN-13: as colunas tipadas das 3 tabelas são todas as do banco, com o tipo do catálogo', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of FINANCEIRO) {
          const doBanco = new Map(linhas.filter((l) => l.tabela === tabela).map((l) => [l.coluna, l.tipo]));
          expect(Object.keys(COLUNAS_TIPADAS[tabela]).sort(), tabela).toEqual([...doBanco.keys()].sort());
          for (const [coluna, tipo] of Object.entries(COLUNAS_TIPADAS[tabela])) {
            expect(doBanco.get(coluna), `${tabela}.${coluna}`).toBe(tipo);
          }
        }
      },
      { migrado: true },
    );
  });

  it('FIN-13: as anuláveis do tipo são as anuláveis do banco nas 3 tabelas', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of FINANCEIRO) {
          const doBanco = linhas.filter((l) => l.tabela === tabela && l.anulavel).map((l) => l.coluna).sort();
          expect([...(COLUNAS_ANULAVEIS[tabela] ?? [])].sort(), tabela).toEqual(doBanco);
        }
      },
      { migrado: true },
    );
  });

  it('FIN-13: valores em centavos são inteiros do banco (int4), nunca decimal', () => {
    expect(COLUNAS_TIPADAS.config_financeira.mensalidade_centavos).toBe('int4');
    expect(COLUNAS_TIPADAS.config_financeira.saldo_inicial_centavos).toBe('int4');
    expect(COLUNAS_TIPADAS.lancamentos.valor_centavos).toBe('int4');
  });

  it('FIN-13: as 3 tabelas são graváveis e centavos e datas têm os tipos esperados', () => {
    expectTypeOf<Banco['config_financeira']>().toEqualTypeOf<TabelaConfigFinanceira>();
    expectTypeOf<Banco['lancamentos']>().toEqualTypeOf<TabelaLancamentos>();
    expectTypeOf<Banco['pagamentos_mes']>().toEqualTypeOf<TabelaPagamentosMes>();

    expectTypeOf<Selectable<TabelaLancamentos>['valor_centavos']>().toEqualTypeOf<number>();
    expectTypeOf<Selectable<TabelaLancamentos>['data']>().toEqualTypeOf<string>();
    expectTypeOf<Selectable<TabelaConfigFinanceira>['mensalidade_centavos']>().toEqualTypeOf<number | null>();
    expectTypeOf<Selectable<TabelaPagamentosMes>['lancamento_id']>().toEqualTypeOf<string | null>();

    expectTypeOf<Insertable<TabelaLancamentos>['valor_centavos']>().toEqualTypeOf<number>();
    expectTypeOf<Insertable<TabelaPagamentosMes>['mes']>().toEqualTypeOf<string>();
    expectTypeOf<Updateable<TabelaLancamentos>>().toHaveProperty('descricao');
    expectTypeOf<Updateable<TabelaConfigFinanceira>>().toHaveProperty('mensalidade_centavos');
    expectTypeOf<Updateable<TabelaPagamentosMes>>().toHaveProperty('lancamento_id');
  });
});
