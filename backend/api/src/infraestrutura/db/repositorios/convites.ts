import { sql } from 'kysely';
import type { Db } from '../index.ts';
import * as auditoria from './auditoria.ts';

// Convites de admin (design C2; ACE-31 a ACE-38, ACE-42, ACE-67). Criar e cancelar são do grupo e recebem `grupoId`
// primeiro (G-03). Ler, aceitar e cadastrar partem só do token: o grupo vem do convite, dentro da função do banco
// (exceções registradas em `grupo-id-excecoes.json`). A auditoria de criar, aceitar e cadastrar é gravada pelas
// funções; a de cancelar, aqui.

export interface ResultadoCriar {
  resultado: 'ok' | 'sem_vinculo' | 'ja_e_admin';
  conviteId: string | null;
  expiraEm: Date | null;
  /** Falso dentro do intervalo de 60 s: o convite pendente continua valendo e nenhum e-mail sai (ACE-51). */
  enviar: boolean;
}

/** Cria o convite do e-mail no grupo, com a conta da requisição como autora (ACE-31, ACE-32). */
export async function criar(db: Db, grupoId: string, email: string, tokenHash: Uint8Array): Promise<ResultadoCriar> {
  const { rows } = await sql<{
    resultado: ResultadoCriar['resultado'];
    convite_id: string | null;
    expira_em: Date | null;
    enviar: boolean;
  }>`
    SELECT resultado, convite_id, expira_em, enviar FROM convite_criar(${grupoId}, ${email}, ${tokenHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('convite_criar não devolveu linha');
  return { resultado: linha.resultado, conviteId: linha.convite_id, expiraEm: linha.expira_em, enviar: linha.enviar };
}

/** Cancela o convite pendente do grupo e grava a auditoria. Falso se não há convite pendente com esse id (ACE-38). */
export async function cancelar(db: Db, grupoId: string, id: string): Promise<boolean> {
  const r = await db
    .updateTable('convites_admin')
    .set({ cancelado_em: sql<Date>`now()` })
    .where('grupo_id', '=', grupoId)
    .where('id', '=', id)
    .where('usado_em', 'is', null)
    .where('cancelado_em', 'is', null)
    .where('expira_em', '>', sql<Date>`now()`)
    .executeTakeFirst();
  if (r.numUpdatedRows === 0n) return false;
  await auditoria.registrar(db, grupoId, 'cancelar_convite', 'convite_admin', id);
  return true;
}

export interface ConviteLido {
  email: string;
  grupoNome: string;
  contaExiste: boolean;
}

/** Dados mínimos do convite válido; nulo se vencido, usado, cancelado ou inexistente (ACE-34, ACE-36). */
export async function ler(db: Db, tokenHash: Uint8Array): Promise<ConviteLido | null> {
  const { rows } = await sql<{ email: string; grupo_nome: string; conta_existe: boolean }>`
    SELECT email, grupo_nome, conta_existe FROM convite_ler(${tokenHash})
  `.execute(db);
  const linha = rows[0];
  return linha ? { email: linha.email, grupoNome: linha.grupo_nome, contaExiste: linha.conta_existe } : null;
}

export interface ResultadoAceitar {
  resultado: 'ok' | 'link_invalido' | 'convite_de_outro_email';
  grupoId: string | null;
}

/** Aceita o convite com a conta da requisição (ACE-33, ACE-35, ACE-36, ACE-67). */
export async function aceitar(db: Db, tokenHash: Uint8Array): Promise<ResultadoAceitar> {
  const { rows } = await sql<{ resultado: ResultadoAceitar['resultado']; grupo_id: string | null }>`
    SELECT resultado, grupo_id FROM convite_aceitar(${tokenHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('convite_aceitar não devolveu linha');
  return { resultado: linha.resultado, grupoId: linha.grupo_id };
}

export interface DadosCadastroConvite {
  tokenHash: Uint8Array;
  nome: string;
  senha: string;
  termosVersao: string;
  /** SHA-256 do token da sessão que nasce com a conta. */
  tokenSessaoHash: Uint8Array;
}

export interface ResultadoCadastroConvite {
  resultado: 'ok' | 'link_invalido' | 'conta_existente';
  contaId: string | null;
  grupoId: string | null;
}

/** Cria a conta já confirmada pelo convite, com o vínculo e a sessão (ACE-34). */
export async function cadastrar(db: Db, dados: DadosCadastroConvite): Promise<ResultadoCadastroConvite> {
  const { rows } = await sql<{
    resultado: ResultadoCadastroConvite['resultado'];
    conta_id: string | null;
    grupo_id: string | null;
  }>`
    SELECT resultado, conta_id, grupo_id
      FROM convite_cadastrar(${dados.tokenHash}, ${dados.nome}, ${dados.senha}, ${dados.termosVersao},
                             ${dados.tokenSessaoHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('convite_cadastrar não devolveu linha');
  return { resultado: linha.resultado, contaId: linha.conta_id, grupoId: linha.grupo_id };
}
