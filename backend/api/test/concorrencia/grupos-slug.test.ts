import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoAppAqui, comoSuper, outraConexao } from '../banco/apoio-conta.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Concorrência do slug na `grupo_criar` (T3; GEL-15), laço de `1792844340000_grupo-criar.sql:37-58`.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - Duas transações abertas ao mesmo tempo com a mesma base: a segunda calcula o sufixo (base) antes de a primeira
 *   confirmar, espera na trava do índice único e recebe `unique_violation` em `grupos_slug_key` quando a primeira
 *   confirma; repete, vê a base ocupada e fica com `base-2`. As duas confirmam.
 * - A primeira confirma depois de a segunda calcular o sufixo: é o caso acima (a espera prova a ordem).
 * - Três colisões seguidas: a função desiste na 3ª tentativa e sobe o `unique_violation` (não provocado aqui: exige
 *   três transações concorrentes confirmando em sequência exata; fica coberto pela leitura do `v_tentativa >= 3`).
 * - Colisão numa restrição que não é o slug: sobe na primeira tentativa, sem repetir (contado por uma sequência
 *   chamada por trigger de teste, que não é desfeita pelo subtransaction do bloco EXCEPTION).
 *
 * Evidência da rede (registrar na T3): a função sem o bloco `EXCEPTION` deixa o primeiro teste vermelho.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

// grupo_criar de 7 parâmetros (a de 6 saiu na T25 do simulador, AD-037), com a data que a de 6 usava.
const CRIAR = `SELECT id, slug FROM grupo_criar($1, 'sabado', 'semanal', '09:00', $2, ARRAY['Passe']::text[],
                 (now() AT TIME ZONE 'America/Sao_Paulo')::date)`;

/** Espera até a conexão de `pid` estar parada numa trava (ou estoura o prazo). */
async function esperarTrava(observador: pg.Client, pid: number, prazoMs = 5000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (Date.now() < limite) {
    const r = await observador.query<{ esperando: boolean }>(
      `SELECT wait_event_type = 'Lock' AS esperando FROM pg_stat_activity WHERE pid = $1`,
      [pid],
    );
    if (r.rows[0]?.esperando) return;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  throw new Error(`A conexão ${pid} não chegou a esperar na trava em ${prazoMs} ms`);
}

async function pidDe(c: pg.Client): Promise<number> {
  const r = await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return r.rows[0]?.pid ?? -1;
}

describe('GEL-15: criações concorrentes com a mesma base', () => {
  it('GEL-15: as duas criações confirmam, com base e base-2', async () => {
    const { url, cenario } = aberto;
    const um = await outraConexao(url);
    const dois = await outraConexao(url);
    const slugs: string[] = [];
    try {
      await um.query('BEGIN');
      await comoAppAqui(um, cenario.contaC);
      const r1 = await um.query<{ id: string; slug: string }>(CRIAR, ['Disputa Um', 'disputa']);
      slugs.push(r1.rows[0]?.slug ?? '');

      await dois.query('BEGIN');
      await comoAppAqui(dois, cenario.contaC);
      const pidDois = await pidDe(dois);
      // A segunda calcula a base livre (a primeira não confirmou) e para no índice único.
      const segunda = dois.query<{ id: string; slug: string }>(CRIAR, ['Disputa Dois', 'disputa']);
      await esperarTrava(aberto.db, pidDois);

      await um.query('COMMIT');
      const r2 = await segunda;
      await dois.query('COMMIT');
      slugs.push(r2.rows[0]?.slug ?? '');
    } finally {
      await um.query('ROLLBACK').catch(() => undefined);
      await dois.query('ROLLBACK').catch(() => undefined);
      await um.end();
      await dois.end();
    }
    expect(slugs).toEqual(['disputa', 'disputa-2']);
    const gravados = await aberto.db.query<{ slug: string }>(
      `SELECT slug FROM grupos WHERE slug LIKE 'disputa%' ORDER BY slug`,
    );
    expect(gravados.rows.map((l) => l.slug)).toEqual(['disputa', 'disputa-2']);
  });
});

describe('GEL-15: violação em outra restrição', () => {
  it('GEL-15: unique_violation que não é grupos_slug_key sobe na primeira tentativa', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      // Restrição de teste em grupos.nome e um contador de tentativas que o subtransaction não desfaz.
      await db.query('CREATE UNIQUE INDEX grupos_nome_teste ON grupos (nome)');
      await db.query('CREATE SEQUENCE tentativas_teste');
      await db.query('GRANT USAGE ON SEQUENCE tentativas_teste TO PUBLIC');
      await db.query(
        `CREATE FUNCTION contar_tentativa_teste() RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN PERFORM nextval('tentativas_teste'); RETURN NEW; END $$`,
      );
      await db.query(
        `CREATE TRIGGER contar_tentativa_teste BEFORE INSERT ON grupos
           FOR EACH ROW EXECUTE FUNCTION contar_tentativa_teste()`,
      );
      await comoAppAqui(db, cenario.contaC);
      await db.query('SAVEPOINT tentativa');
      // Mesmo nome de G: colide em grupos_nome_teste, não no slug (a base é livre).
      await expect(db.query(CRIAR, ['Pelada de Quinta', 'base-livre'])).rejects.toMatchObject({
        code: '23505',
        constraint: 'grupos_nome_teste',
      });
      await db.query('ROLLBACK TO SAVEPOINT tentativa');
      await comoSuper(db);
      const r = await db.query<{ n: string }>('SELECT (CASE WHEN is_called THEN last_value ELSE 0 END)::text AS n FROM tentativas_teste');
      expect(r.rows[0]?.n).toBe('1');
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
