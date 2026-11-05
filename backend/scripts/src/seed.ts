import type pg from 'pg';
import { comConexao, executarCli } from './conectar.ts';
import { validarSenha } from './dono.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';

/**
 * `pnpm seed` (FUN-05, AD-009): dados de exemplo no banco local migrado. Roda como a role de
 * migração (DATABASE_URL_MIGRACAO, o superusuário local), porque `pelada_app` não tem grant
 * nas tabelas de conta e nasce sem login; define o LOGIN PASSWORD de `pelada_app` e de
 * `pelada_backup_ro` a partir do `.env`. Só aceita `localhost` e `127.0.0.1`.
 * Rodar de novo não duplica nada: cada inserção é "se ainda não existe".
 *
 * A conta admin (ACE-64) nasce confirmada e com a senha de `SEED_SENHA_ADMIN`, definida por
 * `conta_definir_senha` (a mesma função do script do dono); sem a variável, o seed recusa antes
 * de conectar. A senha nunca é impressa.
 */

export class ErroSeed extends Error {
  override name = 'ErroSeed';
}

/** Conta admin do ambiente local; a senha vem de `SEED_SENHA_ADMIN` (ACE-64). */
export const CONTA_LOCAL = { email: 'admin@exemplo.test', nome: 'Admin Local' } as const;
/** Hash que não é bcrypt: a conta não entra até `conta_definir_senha` gravar o da senha. */
const HASH_PROVISORIO = '!';
export const GRUPO_LOCAL = { nome: 'Pelada Local', slug: 'pelada-local' } as const;
export const JOGADORES_LOCAIS = ['Bigode', 'Canhota', 'Paredão', 'Xerife', 'Foguete', 'Maestro'] as const;

export interface ResultadoSeed {
  contaId: string;
  grupoId: string;
  jogadores: number;
}

function exigir(env: Record<string, string | undefined>, nome: string): string {
  const v = env[nome];
  if (!v) throw new ErroSeed(`${nome} não definida (veja o .env.example).`);
  return v;
}

async function idDe(c: pg.Client, sql: string, valores: unknown[]): Promise<string> {
  const id = (await c.query<{ id: string }>(sql, valores)).rows[0]?.id;
  if (!id) throw new ErroSeed(`Seed sem id: ${sql}`);
  return id;
}

async function semear(c: pg.Client, senhaApp: string, senhaBackup: string, senhaAdmin: string): Promise<ResultadoSeed> {
  await c.query(
    `INSERT INTO contas (email, nome, senha_hash, criada_em)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (email) DO NOTHING`,
    [CONTA_LOCAL.email, CONTA_LOCAL.nome, HASH_PROVISORIO],
  );
  // Troca o hash, confirma o e-mail e encerra as sessões da conta (ACE-64); rodar de novo só troca a senha.
  const contaId = await idDe(c, 'SELECT conta_definir_senha($1, $2, false) AS id', [CONTA_LOCAL.email, senhaAdmin]);

  await c.query(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'sabado', 'semanal', '09:00', $3, now())
     ON CONFLICT (slug) DO NOTHING`,
    [GRUPO_LOCAL.nome, GRUPO_LOCAL.slug, contaId],
  );
  const grupoId = await idDe(c, 'SELECT id FROM grupos WHERE slug = $1', [GRUPO_LOCAL.slug]);

  await c.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
     VALUES ($1, $2, true, $1, now())
     ON CONFLICT (conta_id, grupo_id) DO NOTHING`,
    [contaId, grupoId],
  );

  for (const apelido of JOGADORES_LOCAIS) {
    await c.query(
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, $2, $3, now(), $3, now())
       ON CONFLICT (grupo_id, lower(apelido)) DO NOTHING`,
      [grupoId, apelido, contaId],
    );
  }
  // Um período aberto por jogador, para o elenco aparecer como ativo.
  await c.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio)
     SELECT j.id, j.grupo_id, current_date FROM jogadores j
      WHERE j.grupo_id = $1
        AND NOT EXISTS (SELECT 1 FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.fim IS NULL)`,
    [grupoId],
  );
  const jogadores = (
    await c.query<{ n: number }>('SELECT count(*)::int AS n FROM jogadores WHERE grupo_id = $1', [grupoId])
  ).rows[0]?.n;

  // ALTER ROLE não aceita parâmetro: a senha entra como literal escapado.
  await c.query(`ALTER ROLE pelada_app LOGIN PASSWORD ${c.escapeLiteral(senhaApp)}`);
  await c.query(`ALTER ROLE pelada_backup_ro LOGIN PASSWORD ${c.escapeLiteral(senhaBackup)}`);

  return { contaId, grupoId, jogadores: jogadores ?? 0 };
}

export async function comandoSeed(
  env: Record<string, string | undefined> = process.env,
): Promise<ResultadoSeed> {
  const url = env.DATABASE_URL_MIGRACAO;
  if (!url) throw new ErroSeed('DATABASE_URL_MIGRACAO não definida (veja o .env.example).');
  // Antes de qualquer conexão (FUN-05): o seed nunca roda contra host remoto, nem com a permissão do deploy.
  exigirHostPermitido(url, HOSTS_LOCAIS);
  const senhaApp = exigir(env, 'PELADA_APP_SENHA');
  const senhaBackup = exigir(env, 'PELADA_BACKUP_RO_SENHA');
  const senhaAdmin = exigir(env, 'SEED_SENHA_ADMIN');
  try {
    validarSenha(senhaAdmin);
  } catch (erro) {
    throw new ErroSeed(`SEED_SENHA_ADMIN inválida: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  return comConexao(url, async (c) => {
    await c.query('BEGIN');
    try {
      const r = await semear(c, senhaApp, senhaBackup, senhaAdmin);
      await c.query('COMMIT');
      return r;
    } catch (erro) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw erro;
    }
  });
}

if (import.meta.main) {
  await executarCli(async () => {
    const r = await comandoSeed();
    console.log(
      `Seed pronto: conta ${CONTA_LOCAL.email} (senha de SEED_SENHA_ADMIN), grupo ${GRUPO_LOCAL.slug}, ${r.jogadores} jogadores.`,
    );
  });
}
