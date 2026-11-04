import pg from 'pg';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';

export interface OpcoesSeed {
  senhaApp: string;
  senhaBackupRo: string;
  /** Roles que ganham LOGIN e senha; o padrão são as da aplicação. */
  roles?: { app: string; backupRo: string };
}

export interface ResultadoSeed {
  contaId: string;
  grupoId: string;
  jogadores: number;
}

const EMAIL = 'seed@pelada.local';
const SLUG = 'pelada-local';
const SENHA_DA_CONTA = 'senha-local-123';
const APELIDOS = ['Zeca', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi'];

/**
 * Seed local (FUN-05): roda como a role de migração, cria uma conta (senha com `crypt`), um grupo
 * com vínculo de admin e jogadores, e dá LOGIN e senha às roles `pelada_app` e `pelada_backup_ro`.
 * Idempotente: rodar de novo não duplica nada. Recusa host fora da lista antes de conectar.
 */
export async function semear(url: string, op: OpcoesSeed): Promise<ResultadoSeed> {
  exigirHostPermitido(url, HOSTS_LOCAIS);
  const roles = op.roles ?? { app: 'pelada_app', backupRo: 'pelada_backup_ro' };
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('begin');
    await c.query(
      `insert into contas (email, nome, senha_hash, criada_em)
       select $1, 'Conta de Teste', crypt($2, gen_salt('bf')), now()
        where not exists (select 1 from contas where email = $1)`,
      [EMAIL, SENHA_DA_CONTA],
    );
    const conta = await c.query<{ id: string }>('select id from contas where email = $1', [EMAIL]);
    const contaId = conta.rows[0]!.id;

    await c.query(
      `insert into grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       select 'Pelada Local', $1, 'quarta', 'semanal', '20:00', $2, now()
        where not exists (select 1 from grupos where slug = $1)`,
      [SLUG, contaId],
    );
    const grupo = await c.query<{ id: string }>('select id from grupos where slug = $1', [SLUG]);
    const grupoId = grupo.rows[0]!.id;

    await c.query(
      `insert into vinculos_admin (conta_id, grupo_id, criado_por, criado_em)
       select $1, $2, $1, now()
        where not exists (select 1 from vinculos_admin where conta_id = $1 and grupo_id = $2)`,
      [contaId, grupoId],
    );
    for (const apelido of APELIDOS) {
      await c.query(
        `insert into jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
         select $1, $2, $3, now(), $3, now()
          where not exists (select 1 from jogadores where grupo_id = $1 and apelido = $2)`,
        [grupoId, apelido, contaId],
      );
    }
    for (const [role, senha] of [
      [roles.app, op.senhaApp],
      [roles.backupRo, op.senhaBackupRo],
    ] as const) {
      const { rows } = await c.query<{ sql: string }>(
        "select format('alter role %I login password %L', $1::text, $2::text) as sql",
        [role, senha],
      );
      await c.query(rows[0]!.sql);
    }
    const n = await c.query<{ n: number }>(
      'select count(*)::int as n from jogadores where grupo_id = $1',
      [grupoId],
    );
    await c.query('commit');
    return { contaId, grupoId, jogadores: n.rows[0]!.n };
  } catch (erro) {
    await c.query('rollback').catch(() => undefined);
    throw erro;
  } finally {
    await c.end();
  }
}

if (import.meta.main) {
  const { DATABASE_URL_MIGRACAO: url, PELADA_APP_SENHA, PELADA_BACKUP_RO_SENHA } = process.env;
  if (!url || !PELADA_APP_SENHA || !PELADA_BACKUP_RO_SENHA) {
    console.error(
      'Defina DATABASE_URL_MIGRACAO, PELADA_APP_SENHA e PELADA_BACKUP_RO_SENHA (veja o .env.example).',
    );
    process.exit(1);
  }
  semear(url, { senhaApp: PELADA_APP_SENHA, senhaBackupRo: PELADA_BACKUP_RO_SENHA }).then(
    (r) =>
      console.log(`Seed ok: grupo ${r.grupoId} com ${r.jogadores} jogadores (conta ${EMAIL}).`),
    (e) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
