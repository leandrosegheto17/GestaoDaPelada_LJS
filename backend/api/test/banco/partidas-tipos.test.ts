import type { Insertable, Kysely, Selectable, Updateable } from 'kysely';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COLUNAS_ANULAVEIS,
  COLUNAS_TIPADAS,
  type Banco,
  type TabelaConfigPesos,
  type TabelaEventosUso,
  type TabelaPartidas,
  type TabelaPresencas,
} from '../../src/infraestrutura/db/tipos.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Tipos Kysely das tabelas da partidas-e-ranking (T80; PAR-62): as colunas tipadas de `config_pesos`, `partidas`,
 * `presencas` e `eventos_uso` são todas as do banco migrado, com o tipo do catálogo e as mesmas anuláveis; partidas,
 * presenças e pesos são graváveis, e `eventos_uso` só aceita inserção.
 */

const DA_FEATURE = ['config_pesos', 'partidas', 'presencas', 'eventos_uso'] as const;

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
      [[...DA_FEATURE]],
    );
    return r.rows;
  });
}

/**
 * Nunca chamada: só o typecheck a lê. Se `eventos_uso` passar a aceitar UPDATE no tipo, o `@ts-expect-error` deixa de
 * ter erro para esperar e o typecheck falha.
 */
function updateDeEventoNaoCompila(db: Kysely<Banco>): void {
  // @ts-expect-error eventos_uso é só de inserção (PAR-62, T23)
  void db.updateTable('eventos_uso').set({ tipo: 'ranking_aberto' });
  // @ts-expect-error a data da partida não muda (T25)
  void db.updateTable('partidas').set({ data: '2026-10-01' });
  // @ts-expect-error a vigência da configuração não muda (T25)
  void db.updateTable('config_pesos').set({ vigente_desde: '2026-10-01' });
}

describe('tipos da partidas-e-ranking (PAR-62)', () => {
  it('PAR-62: as colunas tipadas das 4 tabelas são todas as do banco, com o tipo do catálogo', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of DA_FEATURE) {
          const doBanco = new Map(
            linhas.filter((l) => l.tabela === tabela).map((l) => [l.coluna, l.tipo]),
          );
          expect(doBanco.size, `${tabela} existe no banco`).toBeGreaterThan(0);
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

  it('PAR-62: as anuláveis do tipo são as anuláveis do banco nas 4 tabelas', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of DA_FEATURE) {
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

  it('PAR-62: partidas, presenças e pesos são graváveis, com as colunas fixas fora do UPDATE', () => {
    expectTypeOf<Banco['partidas']>().toEqualTypeOf<TabelaPartidas>();
    expectTypeOf<Banco['presencas']>().toEqualTypeOf<TabelaPresencas>();
    expectTypeOf<Banco['config_pesos']>().toEqualTypeOf<TabelaConfigPesos>();

    expectTypeOf<Selectable<TabelaPartidas>['data']>().toEqualTypeOf<string>();
    expectTypeOf<Insertable<TabelaPartidas>['data']>().toEqualTypeOf<string>();
    expectTypeOf<Updateable<TabelaPartidas>>().toHaveProperty('choveu');
    expectTypeOf<Updateable<TabelaPartidas>>().not.toHaveProperty('data');
    expectTypeOf<Updateable<TabelaPartidas>>().not.toHaveProperty('grupo_id');

    expectTypeOf<Insertable<TabelaPresencas>['situacao']>().toEqualTypeOf<
      'presente' | 'lesionado' | 'expulso'
    >();

    expectTypeOf<Selectable<TabelaConfigPesos>['expulso']>().toEqualTypeOf<number>();
    expectTypeOf<Updateable<TabelaConfigPesos>>().toHaveProperty('expulso_com_chuva');
    expectTypeOf<Updateable<TabelaConfigPesos>>().not.toHaveProperty('vigente_desde');
  });

  it('PAR-62: eventos_uso só aceita inserção', () => {
    expectTypeOf<Banco['eventos_uso']>().toEqualTypeOf<TabelaEventosUso>();
    expectTypeOf<keyof Updateable<TabelaEventosUso>>().toEqualTypeOf<never>();
    expectTypeOf<Insertable<TabelaEventosUso>>().toHaveProperty('tipo');
    expectTypeOf<Insertable<TabelaEventosUso>>().not.toHaveProperty('id');
    expect(typeof updateDeEventoNaoCompila).toBe('function');
  });
});
