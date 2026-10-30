import { sql } from 'kysely';
import type { Db } from '../index.ts';

// Repositório de contas: a única porta da aplicação para as funções de conta do banco (design C2, G-02, AD-008).
// Recebe valores já validados pelo contrato; a senha vai como parâmetro e o hash é feito dentro do banco.

export interface DadosCadastro {
  email: string;
  nome: string;
  senha: string;
  termosVersao: string;
  /** SHA-256 do token do link de confirmação. */
  tokenHash: Uint8Array;
}

export interface ResultadoCadastro {
  situacao: 'nova' | 'existente';
  contaId: string;
  /** Falso dentro do intervalo de 60 s do mesmo e-mail (ACE-51). */
  enviar: boolean;
}

/** Cadastra a conta não confirmada; com e-mail que já existe, nada muda e volta `existente` (ACE-01, ACE-04). */
export async function cadastrar(db: Db, dados: DadosCadastro): Promise<ResultadoCadastro> {
  const { rows } = await sql<{ situacao: 'nova' | 'existente'; conta_id: string; enviar: boolean }>`
    SELECT situacao, conta_id, enviar
      FROM conta_cadastrar(${dados.email}, ${dados.nome}, ${dados.senha}, ${dados.termosVersao}, ${dados.tokenHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('conta_cadastrar não devolveu linha');
  return { situacao: linha.situacao, contaId: linha.conta_id, enviar: linha.enviar };
}

export interface DadosEntrar {
  email: string;
  senha: string;
  /** SHA-256 do IP de origem (o IP não fica gravado). */
  ipHash: Uint8Array;
  /** SHA-256 do token da sessão que será criada se der certo. */
  tokenHash: Uint8Array;
}

export interface ResultadoEntrar {
  resultado: 'ok' | 'invalida' | 'bloqueado' | 'nao_confirmado';
  contaId: string | null;
  nome: string | null;
  bloqueadoAte: Date | null;
}

/** Entrar com e-mail e senha (ACE-09 a ACE-14). Com `ok`, a sessão já está gravada com `tokenHash`. */
export async function entrar(db: Db, dados: DadosEntrar): Promise<ResultadoEntrar> {
  const { rows } = await sql<{
    resultado: ResultadoEntrar['resultado'];
    conta_id: string | null;
    nome: string | null;
    bloqueado_ate: Date | null;
  }>`
    SELECT resultado, conta_id, nome, bloqueado_ate
      FROM conta_entrar(${dados.email}, ${dados.senha}, ${dados.ipHash}, ${dados.tokenHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('conta_entrar não devolveu linha');
  return { resultado: linha.resultado, contaId: linha.conta_id, nome: linha.nome, bloqueadoAte: linha.bloqueado_ate };
}

export interface Eu {
  id: string;
  nome: string;
  email: string;
  grupos: { id: string; nome: string; slug: string; acessaFinanceiro: boolean }[];
}

/**
 * A conta da requisição e os grupos ativos em que ela tem vínculo (ACE-18). O grupo arquivado fica de fora, mesmo para
 * a criadora: a lista completa, com os arquivados, é a de `GET /api/grupos` (GEL-25, GEL-27). Sem conta, nulo.
 */
export async function eu(db: Db): Promise<Eu | null> {
  const conta = await db
    .selectFrom('contas')
    .select(['id', 'nome', 'email'])
    .where('id', '=', sql<string>`app_conta_id()`)
    .executeTakeFirst();
  if (!conta) return null;
  const grupos = await db
    .selectFrom('vinculos_admin as v')
    .innerJoin('grupos as g', 'g.id', 'v.grupo_id')
    .select(['g.id', 'g.nome', 'g.slug', 'v.acessa_financeiro'])
    .where('v.conta_id', '=', conta.id)
    .where('g.arquivado_em', 'is', null)
    .orderBy('g.nome')
    .orderBy('g.id')
    .execute();
  return {
    ...conta,
    grupos: grupos.map((g) => ({ id: g.id, nome: g.nome, slug: g.slug, acessaFinanceiro: g.acessa_financeiro })),
  };
}

export interface DadosTrocarSenha {
  senhaAtual: string;
  senhaNova: string;
  /** Hash do token da sessão da requisição: ela fica, as outras caem (ACE-26). */
  tokenSessaoHash: Uint8Array;
}

/**
 * Troca a senha da conta da requisição. `false` se a senha atual não confere: a falha fica gravada e nada mais muda
 * (ACE-27). `'bloqueado'` depois de 5 falhas da senha atual da conta em 15 min: a senha nem é conferida (ACE-70).
 * A falha só conta se a transação for confirmada: a rota chama numa transação própria.
 */
export async function trocarSenha(db: Db, dados: DadosTrocarSenha): Promise<boolean | 'bloqueado'> {
  const { rows } = await sql<{ ok: boolean | null }>`
    SELECT conta_trocar_senha(${dados.senhaAtual}, ${dados.senhaNova}, ${dados.tokenSessaoHash}) AS ok
  `.execute(db);
  const ok = rows[0]?.ok;
  if (ok === null) return 'bloqueado';
  return ok === true;
}

export interface ResultadoExcluir {
  resultado: 'ok' | 'senha_incorreta' | 'unico_admin' | 'bloqueado';
  /** Com `unico_admin`, os grupos não arquivados em que a conta é a única admin (ACE-29). */
  grupos: { id: string; nome: string }[];
}

/**
 * Exclui (anonimiza) a conta da requisição (ACE-28 a ACE-30, ACE-69). A auditoria da exclusão é gravada pela
 * própria função do banco. `bloqueado` depois de 5 falhas da senha atual da conta em 15 min (ACE-70); a falha só
 * conta se a transação for confirmada.
 */
export async function excluir(db: Db, senha: string): Promise<ResultadoExcluir> {
  const { rows } = await sql<{ resultado: ResultadoExcluir['resultado']; grupos: { id: string; nome: string }[] }>`
    SELECT resultado, grupos FROM conta_excluir(${senha})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('conta_excluir não devolveu linha');
  return { resultado: linha.resultado, grupos: linha.grupos };
}
