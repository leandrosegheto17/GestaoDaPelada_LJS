import { sql } from 'kysely';
import { bytea, type Db } from './tipos.ts';

/**
 * Repositórios de contas e links (T22; ACE-18). A única porta da API para as funções de conta
 * do banco (`SECURITY DEFINER`, migrações `1792843440000` a `1792844160000`): recebem só hashes
 * e valores já validados pelo contrato e devolvem o resultado tipado. Nenhuma consulta daqui lê
 * o hash da senha nem a marca de dono da conta (ACE-43, ACE-63).
 */

// ---------------------------------------------------------------- contas

export interface DadosCadastro {
  email: string;
  nome: string;
  senha: string;
  termosVersao: string;
  /** SHA-256 do token do link de confirmação. */
  tokenHash: Uint8Array;
}

export interface ResultadoCadastro {
  /** `nova`: conta criada; `existente`: o e-mail já tinha conta e nada mudou (ACE-04). */
  situacao: 'nova' | 'existente';
  contaId: string;
  /** Falso dentro dos 60 s do último envio do mesmo tipo (ACE-51). */
  enviar: boolean;
}

/** `conta_cadastrar` (`1792843440000_conta-cadastro-e-links.sql:29`). */
async function cadastrar(db: Db, d: DadosCadastro): Promise<ResultadoCadastro> {
  const r = await sql<{ situacao: 'nova' | 'existente'; conta_id: string; enviar: boolean }>`
    SELECT situacao, conta_id, enviar
      FROM conta_cadastrar(${d.email}, ${d.nome}, ${d.senha}, ${d.termosVersao}, ${bytea(d.tokenHash)})`.execute(
    db,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('conta_cadastrar sem resultado');
  return { situacao: linha.situacao, contaId: linha.conta_id, enviar: linha.enviar };
}

export interface DadosEntrar {
  email: string;
  senha: string;
  /** SHA-256 da chave do IP (/64, ACE-71). */
  ipHash: Uint8Array;
  /** SHA-256 do token da sessão nova, gravada só quando o resultado é `ok`. */
  tokenHash: Uint8Array;
}

export type ResultadoEntrar =
  | { resultado: 'ok'; contaId: string; nome: string }
  | { resultado: 'invalida' }
  | { resultado: 'nao_confirmado' }
  | { resultado: 'bloqueado'; bloqueadoAte: Date };

/** `conta_entrar` (`1792844040000_conta-entrar-teto-conta.sql:22`). */
async function entrar(db: Db, d: DadosEntrar): Promise<ResultadoEntrar> {
  const r = await sql<{
    resultado: string;
    conta_id: string | null;
    nome: string | null;
    bloqueado_ate: Date | null;
  }>`
    SELECT resultado, conta_id, nome, bloqueado_ate
      FROM conta_entrar(${d.email}, ${d.senha}, ${bytea(d.ipHash)}, ${bytea(d.tokenHash)})`.execute(
    db,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('conta_entrar sem resultado');
  switch (linha.resultado) {
    case 'ok':
      return { resultado: 'ok', contaId: linha.conta_id ?? '', nome: linha.nome ?? '' };
    case 'nao_confirmado':
      return { resultado: 'nao_confirmado' };
    case 'bloqueado':
      return { resultado: 'bloqueado', bloqueadoAte: new Date(linha.bloqueado_ate ?? Date.now()) };
    default:
      return { resultado: 'invalida' };
  }
}

export interface DadosTrocarSenha {
  senhaAtual: string;
  senhaNova: string;
  /** SHA-256 do token da sessão atual: ela fica; as outras da conta são encerradas (ACE-26). */
  tokenHash: Uint8Array;
}

export type ResultadoTrocarSenha = 'ok' | 'senha_incorreta' | 'bloqueado';

/** `conta_trocar_senha` (`1792843800000_conta-senha-bloqueio.sql:53`): verdadeiro, falso ou nulo (bloqueado). */
async function trocarSenha(db: Db, d: DadosTrocarSenha): Promise<ResultadoTrocarSenha> {
  const r = await sql<{ ok: boolean | null }>`
    SELECT conta_trocar_senha(${d.senhaAtual}, ${d.senhaNova}, ${bytea(d.tokenHash)}) AS ok`.execute(
    db,
  );
  const ok = r.rows[0]?.ok;
  if (ok === null || ok === undefined) return 'bloqueado';
  return ok ? 'ok' : 'senha_incorreta';
}

export type ResultadoExcluir =
  | { resultado: 'ok' | 'senha_incorreta' | 'bloqueado' }
  | { resultado: 'unico_admin'; grupos: Array<{ id: string; nome: string }> };

/** `conta_excluir` (`1792843800000_conta-senha-bloqueio.sql:92`), da conta da sessão. */
async function excluir(db: Db, senha: string): Promise<ResultadoExcluir> {
  const r = await sql<{ resultado: string; grupos: Array<{ id: string; nome: string }> }>`
    SELECT resultado, grupos FROM conta_excluir(${senha})`.execute(db);
  const linha = r.rows[0];
  if (!linha) throw new Error('conta_excluir sem resultado');
  if (linha.resultado === 'unico_admin') return { resultado: 'unico_admin', grupos: linha.grupos };
  if (linha.resultado === 'ok' || linha.resultado === 'bloqueado')
    return { resultado: linha.resultado };
  return { resultado: 'senha_incorreta' };
}

export interface GrupoDaConta {
  id: string;
  nome: string;
  slug: string;
  acessa_financeiro: boolean;
}

export interface Eu {
  id: string;
  nome: string;
  email: string;
  grupos: GrupoDaConta[];
}

/**
 * A conta da sessão e os grupos dela, sob a RLS (ACE-18): `contas` só mostra a própria linha e
 * `grupos` só os de `grupos_visiveis()`. Sem conta, nulo.
 *
 * Só grupos ativos (grupos-e-elenco T24; GEL-25, GEL-27): o arquivado some da sessão também para
 * a criadora, que o vê só em `GET /api/grupos`, na seção "Arquivados" (`GD:91`, `GD:286`).
 * [LACUNA] o teste `ACE-18: a criadora ainda vê o próprio grupo arquivado`
 * (`test/repositorios/contas.test.ts:57`) afirma o contrário; mudar teste existente pede aprovação.
 */
async function eu(db: Db): Promise<Eu | null> {
  const conta = await sql<{ id: string; nome: string; email: string }>`
    SELECT id, nome, email FROM contas WHERE id = app_conta_id() AND excluida_em IS NULL`.execute(
    db,
  );
  const linha = conta.rows[0];
  if (!linha) return null;
  const grupos = await sql<GrupoDaConta>`
    SELECT g.id, g.nome, g.slug, v.acessa_financeiro
      FROM grupos g
      JOIN vinculos_admin v ON v.grupo_id = g.id AND v.conta_id = app_conta_id()
     WHERE g.arquivado_em IS NULL
     ORDER BY g.nome, g.id`.execute(db);
  return { id: linha.id, nome: linha.nome, email: linha.email, grupos: grupos.rows };
}

export const contas = { cadastrar, entrar, trocarSenha, excluir, eu };

// ---------------------------------------------------------------- links

export type TipoLink = 'confirmacao' | 'recuperacao';

export interface ResultadoPedirLink {
  /** Verdadeiro: o link foi gravado e o e-mail deve sair. Falso: sem conta, já confirmada ou dentro dos 60 s. */
  enviar: boolean;
  nome: string | null;
  /** E-mail da conta já confirmado (ACE-73: recuperação de conta não confirmada gasta a cota de cadastro). */
  confirmada: boolean;
}

/** `link_pedir_com_confirmacao` (`1792843920000_conta-esqueci-nao-confirmada.sql:9`). */
async function pedir(
  db: Db,
  email: string,
  tipo: TipoLink,
  tokenHash: Uint8Array,
): Promise<ResultadoPedirLink> {
  const r = await sql<{ enviar: boolean; nome: string | null; confirmada: boolean }>`
    SELECT enviar, nome, confirmada FROM link_pedir_com_confirmacao(${email}, ${tipo}, ${bytea(tokenHash)})`.execute(
    db,
  );
  const linha = r.rows[0];
  return {
    enviar: linha?.enviar ?? false,
    nome: linha?.nome ?? null,
    confirmada: linha?.confirmada ?? false,
  };
}

/**
 * `link_confirmar` (`1792843740000_conta-confirmar-sem-sessao.sql`): confirma o e-mail sem abrir
 * sessão (ACE-06). Devolve a conta, ou nulo para link vencido, usado ou inexistente (ACE-07).
 */
async function confirmar(db: Db, tokenHash: Uint8Array): Promise<string | null> {
  const r = await sql<{ conta: string | null }>`
    SELECT link_confirmar(${bytea(tokenHash)}, NULL) AS conta`.execute(db);
  return r.rows[0]?.conta ?? null;
}

/**
 * `link_nova_senha` (`1792844160000_conta-nova-senha-zera-falhas.sql:10`): troca a senha, usa o
 * link, encerra as sessões e zera as falhas (ACE-24, ACE-76). Falso para link inválido (ACE-25).
 */
async function novaSenha(db: Db, tokenHash: Uint8Array, senha: string): Promise<boolean> {
  const r = await sql<{
    ok: boolean | null;
  }>`SELECT link_nova_senha(${bytea(tokenHash)}, ${senha}) AS ok`.execute(db);
  return r.rows[0]?.ok === true;
}

export const links = { pedir, confirmar, novaSenha };
