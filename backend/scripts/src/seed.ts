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
 * O grupo de exemplo nasce pela `grupo_criar` (GEL-01, GD:211), com a conta do seed em `app.conta_id`: vínculo com
 * financeiro, as 6 habilidades iniciais na ordem do GEL-02 e a auditoria `grupo_criado`. O elenco tem jogadores com
 * período aberto e notas, um sem nota e um inativo (período encerrado), para a lista, a ficha e as jornadas (GEL-46).
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
/** Jogador do seed com o período encerrado (aparece em Inativos). */
export const JOGADOR_INATIVO_LOCAL = 'Maestro';
/**
 * As 6 habilidades iniciais, na ordem do GEL-02. Cópia de `HABILIDADES_INICIAIS` (`backend/dominio/src/elenco/nivel.ts:7`):
 * o pacote de scripts não depende do domínio, e o teste do seed confere a ordem.
 */
export const HABILIDADES_LOCAIS = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'] as const;
/** Notas por jogador, na ordem de `HABILIDADES_LOCAIS`. Paredão fica sem nota ("sem nota" na lista). */
export const NOTAS_LOCAIS: Readonly<Record<string, readonly number[]>> = {
  Bigode: [8, 7, 6, 7, 8, 5],
  Canhota: [6, 8, 7, 9, 7, 4],
  Xerife: [5, 6, 8, 4, 5, 9],
  Foguete: [7, 6, 9, 8, 8, 5],
  Maestro: [9, 9, 5, 7, 6, 6],
};

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

  // O grupo nasce pela grupo_criar (GEL-01), que exige a conta da sessão; o set_config vale só nesta transação.
  await c.query(`SELECT set_config('app.conta_id', $1, true)`, [contaId]);
  const existente = (await c.query<{ id: string }>('SELECT id FROM grupos WHERE slug = $1', [GRUPO_LOCAL.slug])).rows[0];
  if (!existente) {
    await c.query(
      `SELECT id FROM grupo_criar($1, 'sabado', 'semanal', '09:00'::time, $2, $3::text[])`,
      [GRUPO_LOCAL.nome, GRUPO_LOCAL.slug, [...HABILIDADES_LOCAIS]],
    );
  }
  const grupoId = await idDe(c, 'SELECT id FROM grupos WHERE slug = $1', [GRUPO_LOCAL.slug]);

  // Banco local semeado antes desta versão (grupo inserido direto): completa vínculo e habilidades sem duplicar.
  await c.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
     VALUES ($1, $2, true, $1, now())
     ON CONFLICT (conta_id, grupo_id) DO NOTHING`,
    [contaId, grupoId],
  );
  for (const nome of HABILIDADES_LOCAIS) {
    await c.query(
      `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, $2)
       ON CONFLICT (grupo_id, lower(nome)) DO NOTHING`,
      [grupoId, nome],
    );
  }

  for (const apelido of JOGADORES_LOCAIS) {
    await c.query(
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, $2, $3, now(), $3, now())
       ON CONFLICT (grupo_id, lower(apelido)) DO NOTHING`,
      [grupoId, apelido, contaId],
    );
  }
  // Um período por jogador: aberto desde hoje para os ativos; encerrado ontem para o inativo (GEL-46).
  // Só para quem ainda não tem período, para rodar de novo não abrir nem reabrir nada.
  await c.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim)
     SELECT j.id, j.grupo_id,
            CASE WHEN lower(j.apelido) = lower($2) THEN current_date - 30 ELSE current_date END,
            CASE WHEN lower(j.apelido) = lower($2) THEN current_date - 1 END
       FROM jogadores j
      WHERE j.grupo_id = $1
        AND NOT EXISTS (SELECT 1 FROM periodos_ativos p WHERE p.jogador_id = j.id)`,
    [grupoId, JOGADOR_INATIVO_LOCAL],
  );

  // Notas (GEL-46): ligadas pelo nome da habilidade e pelo apelido; a nota que já existe fica como está.
  const linhas = Object.entries(NOTAS_LOCAIS).flatMap(([apelido, valores]) =>
    valores.map((valor, i) => ({ apelido, habilidade: HABILIDADES_LOCAIS[i] ?? '', valor })),
  );
  await c.query(
    `INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor)
     SELECT j.id, h.id, $1, n.valor
       FROM unnest($2::text[], $3::text[], $4::int[]) AS n(apelido, habilidade, valor)
       JOIN jogadores j ON j.grupo_id = $1 AND lower(j.apelido) = lower(n.apelido)
       JOIN habilidades h ON h.grupo_id = $1 AND lower(h.nome) = lower(n.habilidade)
     ON CONFLICT (jogador_id, habilidade_id) DO NOTHING`,
    [grupoId, linhas.map((l) => l.apelido), linhas.map((l) => l.habilidade), linhas.map((l) => l.valor)],
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
