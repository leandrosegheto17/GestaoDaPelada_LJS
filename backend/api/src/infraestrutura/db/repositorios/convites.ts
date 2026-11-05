import { sql } from 'kysely';
import { bytea, type Db } from './tipos.ts';

/**
 * Repositórios de convites, admins e auditoria (T23; ACE-39, ACE-40, ACE-42). Toda função de
 * grupo recebe o `grupoId` como primeiro dado e filtra por ele, além da RLS. As funções do banco
 * que criam convite ou vínculo gravam a própria auditoria (`1792843620000_conta-convites.sql:4`);
 * cancelar convite e remover admin a gravam aqui, na mesma transação da rota.
 */

// ---------------------------------------------------------------- auditoria

export interface RegistroAuditoria {
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  resumo?: Record<string, unknown>;
}

/**
 * Uma linha de `auditoria` com a conta da sessão como autora (ACE-42). `pelada_app` só tem
 * INSERT (ACE-46), por isso sem `RETURNING`.
 */
async function registrar(db: Db, grupoId: string, r: RegistroAuditoria): Promise<void> {
  await sql`
    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('conta', app_conta_id(), ${r.acao}, ${r.entidade}, ${r.entidadeId ?? null}, ${grupoId}, now(),
            ${JSON.stringify(r.resumo ?? {})}::jsonb)`.execute(db);
}

export const auditoria = { registrar };

// ---------------------------------------------------------------- convites

export type ResultadoCriarConvite =
  | { resultado: 'ok'; conviteId: string; expiraEm: Date; enviar: boolean }
  | { resultado: 'sem_vinculo' | 'ja_e_admin' };

/** `convite_criar` (`1792843620000_conta-convites.sql:13`): convite de 7 dias; grava a auditoria. */
async function criar(db: Db, grupoId: string, email: string, tokenHash: Uint8Array): Promise<ResultadoCriarConvite> {
  const r = await sql<{ resultado: string; convite_id: string | null; expira_em: Date | null; enviar: boolean }>`
    SELECT resultado, convite_id, expira_em, enviar FROM convite_criar(${grupoId}, ${email}, ${bytea(tokenHash)})`.execute(db);
  const linha = r.rows[0];
  if (!linha) throw new Error('convite_criar sem resultado');
  if (linha.resultado === 'ok') {
    return {
      resultado: 'ok',
      conviteId: linha.convite_id ?? '',
      expiraEm: new Date(linha.expira_em ?? Date.now()),
      enviar: linha.enviar,
    };
  }
  return { resultado: linha.resultado === 'ja_e_admin' ? 'ja_e_admin' : 'sem_vinculo' };
}

export interface ConviteLido {
  email: string;
  grupoNome: string;
  contaExiste: boolean;
}

/** `convite_ler` (`1792844460000_convites-grupo-arquivado.sql:11`): nulo para convite inválido (ACE-36). */
async function ler(db: Db, tokenHash: Uint8Array): Promise<ConviteLido | null> {
  const r = await sql<{ email: string; grupo_nome: string; conta_existe: boolean }>`
    SELECT email, grupo_nome, conta_existe FROM convite_ler(${bytea(tokenHash)})`.execute(db);
  const linha = r.rows[0];
  return linha ? { email: linha.email, grupoNome: linha.grupo_nome, contaExiste: linha.conta_existe } : null;
}

export type ResultadoAceitar =
  | { resultado: 'ok'; grupoId: string }
  | { resultado: 'link_invalido' | 'convite_de_outro_email' };

/** `convite_aceitar` (`1792844460000_convites-grupo-arquivado.sql:25`), com a conta da sessão. */
async function aceitar(db: Db, tokenHash: Uint8Array): Promise<ResultadoAceitar> {
  const r = await sql<{ resultado: string; grupo_id: string | null }>`
    SELECT resultado, grupo_id FROM convite_aceitar(${bytea(tokenHash)})`.execute(db);
  const linha = r.rows[0];
  if (linha?.resultado === 'ok') return { resultado: 'ok', grupoId: linha.grupo_id ?? '' };
  return { resultado: linha?.resultado === 'convite_de_outro_email' ? 'convite_de_outro_email' : 'link_invalido' };
}

export interface DadosCadastroConvite {
  tokenHash: Uint8Array;
  nome: string;
  senha: string;
  termosVersao: string;
  /** SHA-256 do token da sessão de 12 h que a função grava para a conta nova. */
  tokenSessaoHash: Uint8Array;
}

export type ResultadoCadastroConvite =
  | { resultado: 'ok'; contaId: string; grupoId: string }
  | { resultado: 'link_invalido' | 'conta_existente' };

/** `convite_cadastrar` (`1792844460000_convites-grupo-arquivado.sql:61`): conta nasce confirmada e com vínculo (ACE-34). */
async function cadastrar(db: Db, d: DadosCadastroConvite): Promise<ResultadoCadastroConvite> {
  const r = await sql<{ resultado: string; conta_id: string | null; grupo_id: string | null }>`
    SELECT resultado, conta_id, grupo_id
      FROM convite_cadastrar(${bytea(d.tokenHash)}, ${d.nome}, ${d.senha}, ${d.termosVersao}, ${bytea(d.tokenSessaoHash)})`.execute(db);
  const linha = r.rows[0];
  if (linha?.resultado === 'ok') return { resultado: 'ok', contaId: linha.conta_id ?? '', grupoId: linha.grupo_id ?? '' };
  return { resultado: linha?.resultado === 'conta_existente' ? 'conta_existente' : 'link_invalido' };
}

/**
 * Cancela um convite pendente do grupo (ACE-38): o link deixa de valer. Grava a auditoria
 * (ACE-42). Falso se o convite não é do grupo, já foi usado ou cancelado.
 */
async function cancelar(db: Db, grupoId: string, id: string): Promise<boolean> {
  const r = await sql<{ id: string }>`
    UPDATE convites_admin SET cancelado_em = now()
     WHERE grupo_id = ${grupoId} AND id = ${id} AND usado_em IS NULL AND cancelado_em IS NULL
    RETURNING id`.execute(db);
  if (r.rows.length === 0) return false;
  await registrar(db, grupoId, { acao: 'cancelar_convite', entidade: 'convite_admin', entidadeId: id });
  return true;
}

export const convites = { criar, ler, aceitar, cadastrar, cancelar };

// ---------------------------------------------------------------- admins

export interface Admin {
  id: string;
  nome: string;
  email: string;
  acessa_financeiro: boolean;
}

export interface ConvitePendente {
  id: string;
  email: string;
  expira_em: Date;
}

export interface ListaAdmins {
  admins: Admin[];
  convites: ConvitePendente[];
}

/** Admins (`admins_listar`, `1792843680000_conta-admins-listar.sql:8`) e convites pendentes do grupo (ACE-37). */
async function listar(db: Db, grupoId: string): Promise<ListaAdmins> {
  const admins = await sql<Admin>`SELECT id, nome, email, acessa_financeiro FROM admins_listar(${grupoId})`.execute(db);
  const pendentes = await sql<ConvitePendente>`
    SELECT id, email, expira_em FROM convites_admin
     WHERE grupo_id = ${grupoId} AND usado_em IS NULL AND cancelado_em IS NULL AND expira_em > now()
     ORDER BY criado_em, id`.execute(db);
  return { admins: admins.rows, convites: pendentes.rows };
}

export type ResultadoRemover = 'ok' | 'ultimo_admin' | 'nao_encontrado';

/**
 * Remove o vínculo de admin (ACE-39), recusando o último (ACE-40). Decisão do design do LJS
 * (`design.md:128`): `SELECT … FOR UPDATE` dos vínculos do grupo na mesma transação. Duas
 * remoções simultâneas no grupo de dois admins se enfileiram na trava; a segunda relê os
 * vínculos já sem o removido, vê um só e responde `ultimo_admin`. Grava a auditoria (ACE-42).
 */
async function remover(db: Db, grupoId: string, contaId: string): Promise<ResultadoRemover> {
  const vinculos = await sql<{ conta_id: string }>`
    SELECT conta_id FROM vinculos_admin WHERE grupo_id = ${grupoId} FOR UPDATE`.execute(db);
  const contas = vinculos.rows.map((v) => v.conta_id);
  if (!contas.includes(contaId)) return 'nao_encontrado';
  if (contas.length <= 1) return 'ultimo_admin';
  await sql`DELETE FROM vinculos_admin WHERE grupo_id = ${grupoId} AND conta_id = ${contaId}`.execute(db);
  await registrar(db, grupoId, { acao: 'remover_admin', entidade: 'vinculo_admin', entidadeId: contaId });
  return 'ok';
}

export const admins = { listar, remover };
