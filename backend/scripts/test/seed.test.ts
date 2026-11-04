import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { expect, test } from 'vitest';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste, comTravaDeMigracao } from '../../api/test/apoio/banco.ts';
import { comoApp } from '../../api/test/isolamento/apoio.ts';
import { semear } from '../src/seed.ts';

/** As roles de login do seed são globais ao cluster: o teste usa roles descartáveis, nunca pelada_app. */
async function comRolesDescartaveis<T>(
  admin: pg.Client,
  corpo: (roles: { app: string; backupRo: string }) => Promise<T>,
) {
  const s = randomBytes(4).toString('hex');
  const roles = { app: `pelada_t_seed_app_${s}`, backupRo: `pelada_t_seed_ro_${s}` };
  await admin.query(`create role ${roles.app} nologin; create role ${roles.backupRo} nologin`);
  try {
    return await corpo(roles);
  } finally {
    await admin.query(`drop role if exists ${roles.app}; drop role if exists ${roles.backupRo}`);
  }
}

async function migrado<T>(corpo: (url: string, c: pg.Client) => Promise<T>) {
  return comBancoDeTeste(async (url) => {
    await comTravaDeMigracao(() => migrar(url));
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      return await corpo(url, c);
    } finally {
      await c.end();
    }
  });
}

const contar = async (c: pg.Client, tabela: string) =>
  (await c.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)).rows[0]!.n;

test('FUN-05: cria 1 conta, 1 grupo com vínculo e jogadores; comoApp com a conta enxerga o grupo', async () => {
  await migrado(async (url, c) => {
    await comRolesDescartaveis(c, async (roles) => {
      const r = await semear(url, { senhaApp: 'app-senha-1', senhaBackupRo: 'ro-senha-1', roles });
      expect(r.jogadores).toBeGreaterThanOrEqual(6);

      expect(await contar(c, 'contas')).toBe(1);
      expect(await contar(c, 'grupos')).toBe(1);
      expect(await contar(c, 'vinculos_admin')).toBe(1);
      expect(await contar(c, 'jogadores')).toBe(r.jogadores);
      // senha com crypt: nunca em texto puro
      const { rows } = await c.query<{ ok: boolean }>(
        "select senha_hash = crypt('senha-local-123', senha_hash) as ok from contas",
      );
      expect(rows[0]!.ok).toBe(true);

      const ids = await comoApp(c, { contaId: r.contaId }, async () =>
        (await c.query<{ id: string }>('select id from grupos')).rows.map((x) => x.id),
      );
      expect(ids).toEqual([r.grupoId]);

      // as roles de login passaram a aceitar senha
      const login = await c.query<{ rolcanlogin: boolean }>(
        'select rolcanlogin from pg_roles where rolname = any($1)',
        [[roles.app, roles.backupRo]],
      );
      expect(login.rows).toHaveLength(2);
      expect(login.rows.every((x) => x.rolcanlogin)).toBe(true);
    });
  });
}, 180_000);

test('FUN-05: com host remoto sai antes de conectar', async () => {
  await expect(
    semear('postgres://u:p@ep-x.sa-east-1.aws.neon.tech/db', { senhaApp: 'a', senhaBackupRo: 'b' }),
  ).rejects.toThrow(/não permitido/);
});

test('FUN-05: rodar duas vezes não duplica nem falha', async () => {
  await migrado(async (url, c) => {
    await comRolesDescartaveis(c, async (roles) => {
      const opcoes = { senhaApp: 'app-senha-1', senhaBackupRo: 'ro-senha-1', roles };
      const a = await semear(url, opcoes);
      const b = await semear(url, opcoes);
      expect(b).toEqual(a);
      for (const t of ['contas', 'grupos', 'vinculos_admin']) expect(await contar(c, t)).toBe(1);
      expect(await contar(c, 'jogadores')).toBe(a.jogadores);
    });
  });
}, 180_000);
