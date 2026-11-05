import { describe, expect, it } from 'vitest';
import { COLUNAS_ANULAVEIS, COLUNAS_TIPADAS } from '../../src/infraestrutura/db/tipos.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

/**
 * Tipos Kysely das tabelas do elenco (T21; GEL-112): cada coluna tipada existe no banco migrado com o tipo do
 * catálogo, e as anuláveis do tipo são as anuláveis do banco.
 */

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
      [Object.keys(COLUNAS_TIPADAS)],
    );
    return r.rows;
  });
}

describe('tipos do banco (GEL-112)', () => {
  it('GEL-112: cada coluna tipada existe no catálogo com o tipo correspondente', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        const porChave = new Map(linhas.map((l) => [`${l.tabela}.${l.coluna}`, l]));
        const faltando: string[] = [];
        const divergentes: string[] = [];
        for (const [tabela, colunas] of Object.entries(COLUNAS_TIPADAS)) {
          for (const [coluna, tipo] of Object.entries(colunas)) {
            const achada = porChave.get(`${tabela}.${coluna}`);
            if (!achada) faltando.push(`${tabela}.${coluna}`);
            else if (achada.tipo !== tipo) divergentes.push(`${tabela}.${coluna}: tipo ${tipo}, banco ${achada.tipo}`);
          }
        }
        expect(faltando).toEqual([]);
        expect(divergentes).toEqual([]);
      },
      { migrado: true },
    );
  });

  it('GEL-112: as colunas do grupo e do elenco tipadas são todas as do banco', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of ['grupos', 'jogadores', 'periodos_ativos', 'habilidades', 'notas'] as const) {
          const doBanco = linhas.filter((l) => l.tabela === tabela).map((l) => l.coluna).sort();
          expect(Object.keys(COLUNAS_TIPADAS[tabela]).sort(), tabela).toEqual(doBanco);
        }
      },
      { migrado: true },
    );
  });

  it('GEL-112: as anuláveis do tipo são as anuláveis do banco', async () => {
    await bancoDeTeste(
      async (url) => {
        const linhas = await catalogo(url);
        for (const tabela of ['grupos', 'jogadores', 'periodos_ativos', 'habilidades', 'notas'] as const) {
          const doBanco = linhas.filter((l) => l.tabela === tabela && l.anulavel).map((l) => l.coluna).sort();
          expect([...(COLUNAS_ANULAVEIS[tabela] ?? [])].sort(), tabela).toEqual(doBanco);
        }
      },
      { migrado: true },
    );
  });
});
