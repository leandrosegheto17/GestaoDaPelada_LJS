import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { comCliente, criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';

const RAIZ = resolve(import.meta.dirname, '../../../..');
// As roles são do servidor: usa as senhas do .env local quando existem, para não trocar a senha do ambiente de dev.
const SENHAS = {
  app: process.env['PELADA_APP_SENHA'] || randomBytes(12).toString('hex'),
  backup: process.env['PELADA_BACKUP_RO_SENHA'] || randomBytes(12).toString('hex'),
};

const SENHA_ADMIN = 'senha-do-seed-1';

function rodarSeed(url: string, extra: NodeJS.ProcessEnv = {}, args: string[] = []) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    PELADA_APP_SENHA: SENHAS.app,
    PELADA_BACKUP_RO_SENHA: SENHAS.backup,
    SEED_SENHA_ADMIN: SENHA_ADMIN,
    ...extra,
  };
  if (!('CI' in extra)) delete env['CI'];
  return spawnSync(process.execPath, ['backend/scripts/seed-local.ts', ...args], { cwd: RAIZ, env, encoding: 'utf8' });
}

function comoLogin(url: string, role: string, senha: string): string {
  const u = new URL(url);
  u.username = role;
  u.password = senha;
  return u.toString();
}

const contar = (url: string, sql: string, params: unknown[] = []) =>
  comCliente(url, async (c) => Number((await c.query<{ n: string }>(sql, params)).rows[0]?.n));

let banco: BancoTemporario;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
});

afterAll(async () => {
  await banco?.remover();
});

describe('pnpm seed (FUN-05)', () => {
  it('banco local migrado ganha um grupo com jogadores, partidas e uma conta admin', async () => {
    const r = rodarSeed(banco.url);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);

    expect(await contar(banco.url, "SELECT count(*) AS n FROM grupos WHERE slug = 'pelada-de-quinta'")).toBe(1);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM jogadores')).toBe(20);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM partidas')).toBe(4);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM presencas')).toBeGreaterThan(0);
    // A conta admin é admin do grupo do seed (vínculo com acesso ao financeiro).
    expect(
      await contar(
        banco.url,
        `SELECT count(*) AS n FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id JOIN grupos g ON g.id = v.grupo_id
          WHERE c.email = 'admin@exemplo.com.br' AND g.slug = 'pelada-de-quinta' AND v.acessa_financeiro`,
      ),
    ).toBe(1);
  });

  it('rodar de novo recria os mesmos dados, sem duplicar', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM grupos')).toBe(1);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM contas')).toBe(1);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM jogadores')).toBe(20);
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM partidas')).toBe(4);
  });

  it('define a senha de login das roles a partir do ambiente: pelada_app entra, sem bypass, e a RLS vale', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const app = new pg.Client({ connectionString: comoLogin(banco.url, 'pelada_app', SENHAS.app) });
    await app.connect();
    try {
      const { rows } = await app.query(
        'SELECT current_user AS usuario, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass',
      );
      expect(rows).toEqual([{ usuario: 'pelada_app', bypass: false }]);
      // Sem contexto, zero linhas; com a conta admin, o grupo do seed.
      expect(Number((await app.query('SELECT count(*) AS n FROM jogadores')).rows[0].n)).toBe(0);
      await app.query('BEGIN');
      // O id da conta admin vem do owner: como pelada_app, sem contexto, nem vinculos_admin aparece.
      const admin = await comCliente(
        banco.url,
        async (c) =>
          (await c.query<{ id: string }>("SELECT id FROM contas WHERE email = 'admin@exemplo.com.br'")).rows[0]?.id,
      );
      await app.query("SELECT set_config('app.conta_id', $1, true)", [admin]);
      expect(Number((await app.query('SELECT count(*) AS n FROM jogadores')).rows[0].n)).toBe(20);
      await app.query('ROLLBACK');
    } finally {
      await app.end();
    }
    const total = await contar(
      comoLogin(banco.url, 'pelada_backup_ro', SENHAS.backup),
      'SELECT count(*) AS n FROM jogadores',
    );
    expect(total).toBe(20);
  });

  it('a conta admin do seed entra com a senha de SEED_SENHA_ADMIN e está confirmada (ACE-64)', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const entrar = (senha: string) =>
      comCliente(banco.url, async (c) => {
        const { rows } = await c.query<{ resultado: string }>('SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
          'admin@exemplo.com.br',
          senha,
          randomBytes(32),
          randomBytes(32),
        ]);
        return rows[0]?.resultado;
      });
    expect(await entrar('outra-senha-qualquer')).toBe('invalida');
    expect(await entrar(SENHA_ADMIN)).toBe('ok');
  });

  it.each([
    ['vazia', ''],
    ['curta demais', 'curta'],
  ])('sem SEED_SENHA_ADMIN válida (%s), sai com erro e não grava nada (ACE-64)', async (_nome, valor) => {
    const vazio = await criarBancoTemporario();
    try {
      await migrar(vazio.url);
      const r = rodarSeed(vazio.url, { SEED_SENHA_ADMIN: valor });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Defina SEED_SENHA_ADMIN');
      expect(r.stderr).not.toContain(valor || 'x'.repeat(40));
      expect(await contar(vazio.url, 'SELECT count(*) AS n FROM contas')).toBe(0);
      expect(await contar(vazio.url, 'SELECT count(*) AS n FROM grupos')).toBe(0);
    } finally {
      await vazio.remover();
    }
  });

  it('falha sem as senhas das roles no ambiente, antes de escrever', async () => {
    const vazio = await criarBancoTemporario();
    try {
      await migrar(vazio.url);
      const r = rodarSeed(vazio.url, { PELADA_APP_SENHA: '' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Defina PELADA_APP_SENHA e PELADA_BACKUP_RO_SENHA');
      expect(await contar(vazio.url, 'SELECT count(*) AS n FROM grupos')).toBe(0);
    } finally {
      await vazio.remover();
    }
  });

  it.each([
    ['URL do Neon', 'postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/pelada', {}, []],
    [
      'URL do Neon mesmo com --alvo producao e CI=true',
      'postgres://u:segredo@ep-x.aws.neon.tech/pelada',
      { CI: 'true' },
      ['--alvo', 'producao'],
    ],
    ['host não local que imita localhost', 'postgres://u:segredo@localhost.exemplo.com/pelada', {}, []],
  ] as const)('recusa %s antes de qualquer escrita', (_nome, url, extra, args) => {
    const r = rodarSeed(url, extra, [...args]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^Host remoto \(/);
    expect(r.stderr).not.toContain('segredo');
    expect(r.stdout).toBe('');
  });
});
