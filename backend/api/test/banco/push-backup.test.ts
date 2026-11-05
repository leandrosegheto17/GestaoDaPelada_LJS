import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { comCenario } from '../isolamento/apoio.ts';

/**
 * Backup das tabelas das notificações (notificacoes T13; NOT-58; AD-010, AD-016). Sem a policy de leitura da role de
 * backup, o `pg_dump` com FORCE ROW LEVEL SECURITY sai com exit 0 e sem nenhuma linha: o teste só passa se o dump feito
 * com `pelada_backup_ro` (um login temporário que herda dela) trouxer as linhas semeadas das três tabelas, e a mesma
 * contagem num banco descartável sem as policies prova que a asserção reprova o dump vazio.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - dump sem as policies: exit 0 e zero linhas (o teste conta as linhas por tabela e exige a quantidade semeada);
 * - sequence das colunas identity sem SELECT para a role: o `pg_dump` falharia (a migração concede);
 * - role de login temporária, nome aleatório, removida no `finally` mesmo com falha (a role é do cluster, não do banco);
 * - banco descartável sempre removido (`comCenario` o remove no `finally`).
 *
 * Exige o cliente `pg_dump` no PATH (o mesmo do `backup.yml`); sem ele o teste falha dizendo isso, sem pular.
 */

const TABELAS = ['push_ranking', 'push_conta', 'avisos_cobranca'] as const;

/** O que o cenário semeia: 1 assinatura de ranking e 1 aviso por grupo (A e B) e 1 assinatura de conta por conta (A e B). */
const SEMEADO = { push_ranking: 2, push_conta: 2, avisos_cobranca: 2 } as const;

async function semear(db: pg.Client, contaA: string, contaB: string): Promise<void> {
  await db.query(
    `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
     VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t13-a', 'p', 'a'), ($2, 'https://fcm.googleapis.com/fcm/send/t13-b', 'p', 'a')`,
    [contaA, contaB],
  );
}

/** Cria o login temporário que herda de `pelada_backup_ro` e o remove no fim. */
async function comLogin<T>(
  db: pg.Client,
  fn: (usuario: string, senha: string) => Promise<T>,
): Promise<T> {
  const usuario = `t13_${randomBytes(5).toString('hex')}`;
  const senha = randomBytes(12).toString('hex');
  await db.query(`CREATE ROLE ${usuario} LOGIN PASSWORD '${senha}' IN ROLE pelada_backup_ro`);
  try {
    return await fn(usuario, senha);
  } finally {
    await db.query(`DROP OWNED BY ${usuario}`).catch(() => undefined);
    await db.query(`DROP ROLE IF EXISTS ${usuario}`);
  }
}

/** O dump só de dados, em INSERTs, das três tabelas, feito pelo login temporário com a segurança por linha ligada. */
function dump(url: string, nome: string, usuario: string, senha: string): string {
  const u = new URL(url);
  const r = spawnSync(
    'pg_dump',
    [
      '--data-only',
      '--inserts',
      '--enable-row-security',
      '--host',
      u.hostname,
      '--port',
      u.port || '5432',
      '--username',
      usuario,
      '--dbname',
      nome,
      ...TABELAS.map((t) => `--table=public.${t}`),
    ],
    { env: { ...process.env, PGPASSWORD: senha }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    throw new Error(
      'pg_dump não encontrado no PATH: instale o cliente do PostgreSQL 18 (o backup.yml usa o mesmo)',
    );
  }
  if (r.status !== 0) throw new Error(`pg_dump saiu com ${r.status}: ${r.stderr}`);
  return r.stdout;
}

function linhasDe(texto: string, tabela: string): number {
  return texto.split('\n').filter((l) => l.startsWith(`INSERT INTO public.${tabela} `)).length;
}

describe('dump com a role de backup', () => {
  it('NOT-58: o dump feito como pelada_backup_ro traz as linhas semeadas das três tabelas', async () => {
    await comCenario(async (db, cenario, banco) => {
      await semear(db, cenario.contaA, cenario.contaB);
      const texto = await comLogin(db, (usuario, senha) =>
        dump(banco.url, banco.nome, usuario, senha),
      );
      for (const tabela of TABELAS) {
        expect(linhasDe(texto, tabela), `linhas de ${tabela} no dump`).toBe(SEMEADO[tabela]);
      }
      expect(texto).toContain('t13-a');
      expect(texto).toContain('pay_aviso_a');
      expect(texto).toContain('semente-b');
    });
  });

  it('NOT-58: sem as policies de backup o dump sai sem linhas, e a asserção do teste acima reprova', async () => {
    await comCenario(async (db, cenario, banco) => {
      await semear(db, cenario.contaA, cenario.contaB);
      for (const tabela of TABELAS) await db.query(`DROP POLICY ${tabela}_backup ON ${tabela}`);
      const total = await db.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM push_ranking) + (SELECT count(*) FROM push_conta) + (SELECT count(*) FROM avisos_cobranca) AS n`,
      );
      expect(Number(total.rows[0]?.n)).toBe(6);
      const texto = await comLogin(db, (usuario, senha) =>
        dump(banco.url, banco.nome, usuario, senha),
      );
      for (const tabela of TABELAS) {
        expect(linhasDe(texto, tabela), `linhas de ${tabela} no dump sem policy`).toBe(0);
        expect(linhasDe(texto, tabela)).not.toBe(SEMEADO[tabela]);
      }
    });
  });

  it('NOT-58: pelada_backup_ro lê as três tabelas (SELECT) e as duas sequences', async () => {
    await comCenario(async (db, cenario) => {
      await semear(db, cenario.contaA, cenario.contaB);
      await db.query('BEGIN');
      try {
        await db.query('SET LOCAL ROLE pelada_backup_ro');
        for (const tabela of TABELAS) {
          const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabela}`);
          expect(r.rows[0]?.n, tabela).toBe(SEMEADO[tabela]);
        }
        for (const sequencia of ['push_ranking_id_seq', 'push_conta_id_seq']) {
          await expect(
            db.query(`SELECT last_value FROM ${sequencia}`),
            sequencia,
          ).resolves.toBeDefined();
        }
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });
});
