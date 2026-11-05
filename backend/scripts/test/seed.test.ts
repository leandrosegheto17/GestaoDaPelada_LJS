import { randomBytes } from 'node:crypto';
import { migrar } from '@pelada/api/migrar';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import {
  comandoSeed,
  CONTA_LOCAL,
  GRUPO_LOCAL,
  HABILIDADES_LOCAIS,
  JOGADOR_INATIVO_LOCAL,
  JOGADORES_LOCAIS,
} from '../src/seed.ts';
import { entrarComo } from './apoio/banco.ts';

const URL_BASE = process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
const ROLES = ['pelada_app', 'pelada_backup_ro'] as const;

function urlDe(base: string, banco: string, usuario?: { nome: string; senha: string }): string {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  if (usuario) {
    u.username = usuario.nome;
    u.password = usuario.senha;
  }
  return u.toString();
}

/**
 * Banco migrado descartável. As roles são do cluster: o LOGIN e a senha de `pelada_app` e
 * `pelada_backup_ro` de antes do teste voltam no `finally`, para o teste não trocar a senha do
 * ambiente local de quem roda a suíte.
 */
async function comBancoMigrado(fn: (url: string, nome: string) => Promise<void>): Promise<void> {
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  const antes = await comConexao(URL_BASE, async (c) =>
    (
      await c.query<{ rolname: string; rolcanlogin: boolean; rolpassword: string | null }>(
        `SELECT rolname, rolcanlogin, rolpassword FROM pg_authid WHERE rolname = ANY ($1::text[])`,
        [ROLES],
      )
    ).rows,
  );
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDe(URL_BASE, nome);
    await migrar(url);
    await fn(url, nome);
  } finally {
    await comConexao(URL_BASE, async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      for (const r of antes) {
        const senha = r.rolpassword === null ? 'NULL' : c.escapeLiteral(r.rolpassword);
        await c.query(`ALTER ROLE ${c.escapeIdentifier(r.rolname)} ${r.rolcanlogin ? 'LOGIN' : 'NOLOGIN'} PASSWORD ${senha}`);
      }
    });
  }
}

function envDe(url: string) {
  return {
    DATABASE_URL_MIGRACAO: url,
    PELADA_APP_SENHA: `app-${randomBytes(8).toString('hex')}`,
    PELADA_BACKUP_RO_SENHA: `backup-${randomBytes(8).toString('hex')}`,
    SEED_SENHA_ADMIN: `admin-${randomBytes(8).toString('hex')}`,
  };
}

async function contagens(url: string) {
  return comConexao(url, async (c) => {
    const n = async (sql: string) => (await c.query<{ n: number }>(sql)).rows[0]?.n;
    return {
      contas: await n('SELECT count(*)::int AS n FROM contas'),
      grupos: await n('SELECT count(*)::int AS n FROM grupos'),
      vinculos: await n('SELECT count(*)::int AS n FROM vinculos_admin'),
      jogadores: await n('SELECT count(*)::int AS n FROM jogadores'),
      periodos: await n('SELECT count(*)::int AS n FROM periodos_ativos'),
    };
  });
}

describe('pnpm seed', () => {
  it('FUN-05: num banco migrado, cria 1 conta, 1 grupo com vínculo e jogadores, e a conta enxerga o grupo como pelada_app', async () => {
    await comBancoMigrado(async (url) => {
      const r = await comandoSeed(envDe(url));
      expect(r.jogadores).toBe(JOGADORES_LOCAIS.length);
      expect(await contagens(url)).toEqual({
        contas: 1,
        grupos: 1,
        vinculos: 1,
        jogadores: JOGADORES_LOCAIS.length,
        periodos: JOGADORES_LOCAIS.length,
      });

      const vistos = await comConexao(url, async (c) => {
        await c.query('BEGIN');
        try {
          await c.query('SET LOCAL ROLE pelada_app');
          await c.query(`SELECT set_config('app.conta_id', $1, true)`, [r.contaId]);
          return (await c.query<{ slug: string }>('SELECT slug FROM grupos')).rows.map((l) => l.slug);
        } finally {
          await c.query('ROLLBACK');
        }
      });
      expect(vistos).toEqual([GRUPO_LOCAL.slug]);
    });
  });

  it('FUN-05: a senha da conta de exemplo é bcrypt e confere', async () => {
    await comBancoMigrado(async (url) => {
      const env = envDe(url);
      await comandoSeed(env);
      const ok = await comConexao(url, async (c) =>
        (
          await c.query<{ ok: boolean; bcrypt: boolean }>(
            `SELECT crypt($2, senha_hash) = senha_hash AS ok, senha_hash LIKE '$2%' AS bcrypt FROM contas WHERE email = $1`,
            [CONTA_LOCAL.email, env.SEED_SENHA_ADMIN],
          )
        ).rows[0],
      );
      expect(ok).toEqual({ ok: true, bcrypt: true });
    });
  });

  it('FUN-05: pelada_app e pelada_backup_ro passam a entrar com as senhas do .env', async () => {
    await comBancoMigrado(async (url, nome) => {
      const env = envDe(url);
      await comandoSeed(env);
      for (const [role, senha] of [
        ['pelada_app', env.PELADA_APP_SENHA],
        ['pelada_backup_ro', env.PELADA_BACKUP_RO_SENHA],
      ] as const) {
        const papel = await comConexao(urlDe(URL_BASE, nome, { nome: role, senha }), async (c) =>
          (await c.query<{ papel: string }>('SELECT current_user AS papel')).rows[0]?.papel,
        );
        expect(papel).toBe(role);
      }
    });
  });

  it('FUN-05: com host remoto, sai antes de conectar', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    try {
      const remoto = 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb';
      await expect(comandoSeed(envDe(remoto))).rejects.toThrow(/não permitido/);
      // Nem a permissão de host remoto do deploy libera o seed.
      await expect(comandoSeed({ ...envDe(remoto), PELADA_PERMITIR_HOST_REMOTO: '1' })).rejects.toThrow(
        /não permitido/,
      );
      // O serviço "postgres" do CI é host de teste, não de seed.
      await expect(comandoSeed(envDe('postgres://postgres:postgres@postgres:5432/pelada'))).rejects.toThrow(
        /não permitido/,
      );
      expect(conectar).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });

  it('FUN-05: sem DATABASE_URL_MIGRACAO ou sem as senhas, falha com a orientação e sem conectar', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    try {
      const local = 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
      await expect(comandoSeed({})).rejects.toThrow(/DATABASE_URL_MIGRACAO/);
      await expect(comandoSeed({ DATABASE_URL_MIGRACAO: local, PELADA_BACKUP_RO_SENHA: 'x' })).rejects.toThrow(
        /PELADA_APP_SENHA/,
      );
      await expect(comandoSeed({ DATABASE_URL_MIGRACAO: local, PELADA_APP_SENHA: 'x' })).rejects.toThrow(
        /PELADA_BACKUP_RO_SENHA/,
      );
      expect(conectar).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });

  it('FUN-05: rodar duas vezes não duplica nem falha', async () => {
    await comBancoMigrado(async (url) => {
      const env = envDe(url);
      const primeiro = await comandoSeed(env);
      const depoisDoPrimeiro = await contagens(url);
      const segundo = await comandoSeed(env);
      expect(segundo).toEqual(primeiro);
      expect(await contagens(url)).toEqual(depoisDoPrimeiro);
    });
  });

  it('FUN-05: erro no meio do seed desfaz tudo (nenhuma linha fica)', async () => {
    await comBancoMigrado(async (url) => {
      // Gatilho de falha: a inserção de jogadores aborta.
      await comConexao(url, (c) =>
        c.query(`
          CREATE FUNCTION falhar() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'falha de propósito'; END $$;
          CREATE TRIGGER falhar BEFORE INSERT ON jogadores FOR EACH ROW EXECUTE FUNCTION falhar();
        `),
      );
      await expect(comandoSeed(envDe(url))).rejects.toThrow('falha de propósito');
      expect(await contagens(url)).toEqual({ contas: 0, grupos: 0, vinculos: 0, jogadores: 0, periodos: 0 });
    });
  });
});

describe('pnpm seed: conta admin que entra', () => {
  it('ACE-64: depois do seed, a conta tem email_confirmado_em e entra por conta_entrar com a senha do ambiente', async () => {
    await comBancoMigrado(async (url) => {
      const env = envDe(url);
      const r = await comandoSeed(env);
      const conta = await comConexao(url, async (c) =>
        (
          await c.query<{ id: string; confirmada: boolean; e_dono: boolean }>(
            'SELECT id, email_confirmado_em IS NOT NULL AS confirmada, e_dono FROM contas WHERE email = $1',
            [CONTA_LOCAL.email],
          )
        ).rows,
      );
      expect(conta).toEqual([{ id: r.contaId, confirmada: true, e_dono: false }]);
      expect(await entrarComo(url, CONTA_LOCAL.email, env.SEED_SENHA_ADMIN)).toBe('ok');
      expect(await entrarComo(url, CONTA_LOCAL.email, 'pelada-local')).toBe('invalida');
    });
  });

  it('ACE-64: rodar de novo com outra SEED_SENHA_ADMIN troca a senha da mesma conta', async () => {
    await comBancoMigrado(async (url) => {
      const env = envDe(url);
      const primeiro = await comandoSeed(env);
      const nova = `admin-${randomBytes(8).toString('hex')}`;
      const segundo = await comandoSeed({ ...env, SEED_SENHA_ADMIN: nova });
      expect(segundo.contaId).toBe(primeiro.contaId);
      expect(await entrarComo(url, CONTA_LOCAL.email, nova)).toBe('ok');
      expect(await entrarComo(url, CONTA_LOCAL.email, env.SEED_SENHA_ADMIN)).toBe('invalida');
    });
  });

  it('ACE-64: sem SEED_SENHA_ADMIN, ou com ela fora dos limites, sai com erro antes de conectar', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    try {
      const { SEED_SENHA_ADMIN: _ignorada, ...semSenha } = envDe('postgres://postgres:postgres@127.0.0.1:5432/pelada');
      await expect(comandoSeed(semSenha)).rejects.toThrow(/SEED_SENHA_ADMIN/);
      await expect(comandoSeed({ ...semSenha, SEED_SENHA_ADMIN: '' })).rejects.toThrow(/SEED_SENHA_ADMIN/);
      await expect(comandoSeed({ ...semSenha, SEED_SENHA_ADMIN: 'curta' })).rejects.toThrow(/SEED_SENHA_ADMIN inválida/);
      expect(conectar).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });
});

describe('pnpm seed: grupo e elenco de exemplo', () => {
  it('GEL-01: o grupo nasce pela grupo_criar, com vínculo com financeiro, criado_por, 6 habilidades na ordem do GEL-02 e grupo_criado', async () => {
    await comBancoMigrado(async (url) => {
      const env = envDe(url);
      const r = await comandoSeed(env);
      const dados = async () =>
        comConexao(url, async (c) => ({
          grupo: (
            await c.query<{ criado_por: string; slug: string }>('SELECT criado_por, slug FROM grupos WHERE id = $1', [
              r.grupoId,
            ])
          ).rows,
          vinculo: (
            await c.query<{ conta_id: string; acessa_financeiro: boolean }>(
              'SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1',
              [r.grupoId],
            )
          ).rows,
          habilidades: (
            await c.query<{ nome: string }>('SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem', [
              r.grupoId,
            ])
          ).rows.map((l) => l.nome),
          auditoria: (
            await c.query<{ autor_conta_id: string; entidade_id: string }>(
              `SELECT autor_conta_id, entidade_id FROM auditoria WHERE acao = 'grupo_criado' AND grupo_id = $1`,
              [r.grupoId],
            )
          ).rows,
        }));

      const esperado = {
        grupo: [{ criado_por: r.contaId, slug: GRUPO_LOCAL.slug }],
        vinculo: [{ conta_id: r.contaId, acessa_financeiro: true }],
        // Texto literal do GEL-02, não a constante do seed: a ordem errada no seed morre aqui.
        habilidades: ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'],
        auditoria: [{ autor_conta_id: r.contaId, entidade_id: r.grupoId }],
      };
      expect(await dados()).toEqual(esperado);
      expect([...HABILIDADES_LOCAIS]).toEqual(esperado.habilidades);

      // Rodar de novo não cria outro grupo, nem habilidade, nem auditoria.
      await comandoSeed(env);
      expect(await dados()).toEqual(esperado);
    });
  });

  it('GEL-46: há jogador ativo com notas, um ativo sem nota e um inativo com o período encerrado', async () => {
    await comBancoMigrado(async (url) => {
      const r = await comandoSeed(envDe(url));
      const linhas = await comConexao(url, async (c) =>
        (
          await c.query<{ apelido: string; abertos: number; encerrados: number; notas: number }>(
            `SELECT j.apelido,
                    (SELECT count(*)::int FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.fim IS NULL) AS abertos,
                    (SELECT count(*)::int FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.fim IS NOT NULL) AS encerrados,
                    (SELECT count(*)::int FROM notas n WHERE n.jogador_id = j.id) AS notas
               FROM jogadores j WHERE j.grupo_id = $1`,
            [r.grupoId],
          )
        ).rows,
      );
      const ativos = linhas.filter((l) => l.abertos === 1);
      const inativos = linhas.filter((l) => l.abertos === 0);

      expect(ativos.some((l) => l.notas === HABILIDADES_LOCAIS.length)).toBe(true);
      expect(ativos.some((l) => l.notas === 0)).toBe(true);
      expect(inativos).toEqual([
        expect.objectContaining({ apelido: JOGADOR_INATIVO_LOCAL, abertos: 0, encerrados: 1 }),
      ]);
      // Nenhuma nota fora da escala nem de outro grupo.
      const fora = await comConexao(url, async (c) =>
        (
          await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM notas WHERE grupo_id <> $1 OR valor NOT BETWEEN 1 AND 10',
            [r.grupoId],
          )
        ).rows[0]?.n,
      );
      expect(fora).toBe(0);
    });
  });
});
