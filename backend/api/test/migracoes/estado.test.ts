import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { detectarEstado, ErroEsquemaDivergente, listarMigracoes } from '../../src/infraestrutura/db/estado.ts';
import { migrar, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

const ARQUIVOS = listarMigracoes(PASTA_MIGRACOES);

/** Esquema e contagem de linhas por tabela: a "foto" que um aborto não pode mudar. */
async function foto(url: string): Promise<{ esquema: string[]; linhas: Record<string, number> }> {
  return comCliente(url, async (c) => {
    const esquema = await lerEsquema(c);
    const tabelas = await c.query<{ t: string }>(
      `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const linhas: Record<string, number> = {};
    for (const { t } of tabelas.rows) {
      const r = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${c.escapeIdentifier(t)}`);
      linhas[t] = r.rows[0]?.n ?? 0;
    }
    return { esquema, linhas };
  });
}

async function estado(url: string) {
  return comCliente(url, (c) => detectarEstado(c, ARQUIVOS));
}

/** Pasta temporária só com as `n` primeiras migrações. */
function pastaComAs(n: number): string {
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-prefixo-'));
  for (const nome of ARQUIVOS.slice(0, n)) {
    copyFileSync(join(PASTA_MIGRACOES, `${nome}.sql`), join(pasta, `${nome}.sql`));
  }
  return pasta;
}

const DIVERGENTES: Array<[string, (url: string) => Promise<void>, RegExp]> = [
  [
    'nome desconhecido na pgmigrations',
    async (url) => {
      await migrar(url);
      await comCliente(url, (c) =>
        c.query(`INSERT INTO pgmigrations (name, run_on) VALUES ('9999999999999_estranha', now())`),
      );
    },
    /sem arquivo na v2: 9999999999999_estranha/,
  ],
  [
    'ordem trocada na pgmigrations',
    async (url) => {
      await migrar(url);
      await comCliente(url, (c) =>
        c.query(
          `UPDATE pgmigrations SET name = CASE name WHEN $1 THEN $2 ELSE $1 END WHERE name IN ($1, $2)`,
          [ARQUIVOS[1], ARQUIVOS[2]],
        ),
      );
    },
    /ordem diferente na posição 2/,
  ],
  [
    'tabelas sem pgmigrations',
    async (url) => {
      await comCliente(url, (c) => c.query('CREATE TABLE solta (id int); INSERT INTO solta VALUES (1)'));
    },
    /tabelas sem pgmigrations: solta/,
  ],
  [
    'controle do legado sem pgmigrations',
    async (url) => {
      await comCliente(url, (c) =>
        c.query("CREATE TABLE migracoes_aplicadas (nome text); INSERT INTO migracoes_aplicadas VALUES ('x')"),
      );
    },
    /controle de migração do legado presente: migracoes_aplicadas/,
  ],
  [
    'pgmigrations vazia com tabelas',
    async (url) => {
      await migrar(url);
      await comCliente(url, (c) => c.query('DELETE FROM pgmigrations'));
    },
    /pgmigrations vazia com tabelas/,
  ],
];

describe('detectarEstado', () => {
  it('FUN-10: banco vazio é vazio e segue para a execução', async () => {
    await bancoDeTeste(async (url) => {
      expect((await estado(url)).estado).toBe('vazio');
      expect(await migrar(url)).toHaveLength(23);
    });
  });

  it('FUN-09: com as 23 aplicadas é gerenciado', async () => {
    await bancoDeTeste(
      async (url) => {
        const d = await estado(url);
        expect(d).toEqual({ estado: 'gerenciado', registradas: ARQUIVOS, diferencas: [] });
      },
      { migrado: true },
    );
  });

  it('FUN-10: com as 20 primeiras (prefixo) é gerenciado e aplica as 3 restantes', async () => {
    const pasta = pastaComAs(20);
    try {
      await bancoDeTeste(async (url) => {
        await migrar(url, { pasta });
        const d = await estado(url);
        expect(d.estado).toBe('gerenciado');
        expect(d.registradas).toEqual(ARQUIVOS.slice(0, 20));
        expect(await migrar(url)).toEqual(ARQUIVOS.slice(20));
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  for (const [nome, preparar, diferenca] of DIVERGENTES) {
    it(`FUN-10: ${nome} é divergente, migrar aborta e nada muda`, async () => {
      await bancoDeTeste(async (url) => {
        await preparar(url);
        const d = await estado(url);
        expect(d.estado).toBe('divergente');
        expect(d.diferencas.join('\n')).toMatch(diferenca);

        const antes = await foto(url);
        const erro = await migrar(url).catch((e: unknown) => e);
        expect(erro).toBeInstanceOf(ErroEsquemaDivergente);
        expect((erro as ErroEsquemaDivergente).diferencas.join('\n')).toMatch(diferenca);
        expect((erro as Error).message).toMatch(/Nada foi alterado/);
        expect(await foto(url)).toEqual(antes);
      });
    });
  }
});
