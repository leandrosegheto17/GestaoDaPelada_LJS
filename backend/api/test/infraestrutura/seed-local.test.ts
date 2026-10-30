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

describe('pnpm seed: grupo, elenco e notas da grupos-e-elenco (T52; GEL-01, GEL-46)', () => {
  const doSeed = "grupo_id = (SELECT id FROM grupos WHERE slug = 'pelada-de-quinta')";

  it('o grupo nasce pela grupo_criar: criado pela conta admin, com as 6 habilidades iniciais e grupo_criado', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const linhas = await comCliente(banco.url, async (c) => {
      const grupo = await c.query<{ criadora: boolean; frequencia: string }>(
        `SELECT g.criado_por = (SELECT id FROM contas WHERE email = 'admin@exemplo.com.br') AS criadora, g.frequencia
           FROM grupos g WHERE g.slug = 'pelada-de-quinta'`,
      );
      const habilidades = await c.query<{ nome: string }>(
        `SELECT nome FROM habilidades WHERE ${doSeed} ORDER BY ordem`,
      );
      const auditoria = await c.query<{ acao: string }>(
        `SELECT acao FROM auditoria WHERE ${doSeed} AND acao = 'grupo_criado'`,
      );
      return { grupo: grupo.rows, habilidades: habilidades.rows.map((h) => h.nome), auditoria: auditoria.rows };
    });
    expect(linhas.grupo).toEqual([{ criadora: true, frequencia: 'semanal' }]);
    expect(linhas.habilidades).toEqual(['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme']);
    expect(linhas.auditoria).toEqual([{ acao: 'grupo_criado' }]);
  });

  it('um jogador inativo com dois períodos encerrados; os outros ativos, cada um com um período aberto', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const porJogador = await comCliente(banco.url, async (c) => {
      const { rows } = await c.query<{ apelido: string; abertos: string; encerrados: string; inicio: string | null }>(
        `SELECT j.apelido, j.inicio_pontuacao::text AS inicio,
                count(*) FILTER (WHERE p.fim IS NULL) AS abertos, count(*) FILTER (WHERE p.fim IS NOT NULL) AS encerrados
           FROM jogadores j JOIN periodos_ativos p ON p.jogador_id = j.id
          WHERE j.${doSeed}
          GROUP BY j.apelido, j.inicio_pontuacao`,
      );
      return rows;
    });
    const inativos = porJogador.filter((j) => Number(j.abertos) === 0);
    expect(inativos).toEqual([{ apelido: 'Zé Carlos', abertos: '0', encerrados: '2', inicio: '2026-10-01' }]);
    const ativos = porJogador.filter((j) => Number(j.abertos) === 1);
    expect(ativos).toHaveLength(19);
    expect(ativos.every((j) => j.encerrados === '0' && j.inicio === '2026-10-01')).toBe(true);
  });

  it('notas: os 10 primeiros e o inativo têm nota em todas as habilidades; os outros ficam sem nota', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const { rows } = await comCliente(banco.url, (c) =>
      c.query<{ apelido: string; n: string }>(
        `SELECT j.apelido, count(n.valor) AS n FROM jogadores j LEFT JOIN notas n ON n.jogador_id = j.id
          WHERE j.${doSeed} GROUP BY j.apelido`,
      ),
    );
    const comNota = rows.filter((r) => r.n === '6').map((r) => r.apelido);
    expect(comNota).toHaveLength(11);
    expect(comNota).toContain('Zé Carlos');
    expect(rows.filter((r) => r.n === '0')).toHaveLength(9);
  });

  it('o inativo não tem presença (nenhuma presença fora de um período)', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    expect(
      await contar(
        banco.url,
        `SELECT count(*) AS n FROM presencas pr JOIN partidas pa ON pa.id = pr.partida_id
          WHERE NOT EXISTS (SELECT 1 FROM periodos_ativos p WHERE p.jogador_id = pr.jogador_id
                              AND p.inicio <= pa.data AND (p.fim IS NULL OR pa.data < p.fim))`,
      ),
    ).toBe(0);
    expect(
      await contar(
        banco.url,
        "SELECT count(*) AS n FROM presencas pr JOIN jogadores j ON j.id = pr.jogador_id WHERE j.apelido = 'Zé Carlos'",
      ),
    ).toBe(0);
  });

  it('roda de novo depois de a conta admin entrar (com sessão aberta), sem sobrar a conta antiga', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const entrou = await comCliente(banco.url, async (c) => {
      const { rows } = await c.query<{ resultado: string }>('SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
        'admin@exemplo.com.br',
        SENHA_ADMIN,
        randomBytes(32),
        randomBytes(32),
      ]);
      return rows[0]?.resultado;
    });
    expect(entrou).toBe('ok');
    expect(await contar(banco.url, 'SELECT count(*) AS n FROM sessoes')).toBeGreaterThan(0);
    const r = rodarSeed(banco.url);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(await contar(banco.url, "SELECT count(*) AS n FROM contas WHERE email = 'admin@exemplo.com.br'")).toBe(1);
  });

  it('rodar duas vezes não duplica habilidades, notas, períodos, vínculos nem auditoria', async () => {
    expect(rodarSeed(banco.url).status).toBe(0);
    const contagens = () =>
      Promise.all(
        ['habilidades', 'notas', 'periodos_ativos', 'vinculos_admin', 'auditoria', 'presencas'].map((t) =>
          contar(banco.url, `SELECT count(*) AS n FROM ${t}`),
        ),
      );
    const antes = await contagens();
    expect(rodarSeed(banco.url).status).toBe(0);
    expect(await contagens()).toEqual(antes);
    expect(antes[0]).toBe(6);
    expect(antes[1]).toBe(66);
    expect(antes[2]).toBe(21);
  });
});
