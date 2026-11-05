import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { abrirCenario, comCenario, type Banco, type Cenario, type CenarioAberto } from './apoio.ts';

/**
 * Cenário dos testes de conta (ACE-43, ACE-45). Estende o cenário da fundação (`criarCenario`):
 * as contas A e B passam a ter senha conhecida e e-mail confirmado, pela própria
 * `conta_definir_senha` (chamada como `postgres`, AD-009), e nasce uma conta não confirmada.
 * Os helpers gravam sessão, link e convite como superusuário e devolvem o token em claro,
 * para o teste chamar as funções do banco com o hash dele (só o SHA-256 vai ao banco, ACE-10).
 */

export const EMAIL_A = 'conta-a@exemplo.test';
export const EMAIL_B = 'conta-b@exemplo.test';
export const EMAIL_SEM_VINCULO = 'sem-vinculo@exemplo.test';
export const EMAIL_NAO_CONFIRMADA = 'nao-confirmada@exemplo.test';

export const SENHA_A = 'senha da conta A 123';
export const SENHA_B = 'senha da conta B 456';
export const SENHA_NAO_CONFIRMADA = 'senha nao confirmada 789';

/** SHA-256 de um texto ou de bytes. */
export function sha256(valor: string | Buffer): Buffer {
  return createHash('sha256').update(valor).digest();
}

export interface Token {
  /** O token em claro (32 bytes), o que iria ao cookie ou ao link. */
  token: Buffer;
  /** O SHA-256 do token, o que o banco guarda. */
  hash: Buffer;
}

export function novoToken(): Token {
  const token = randomBytes(32);
  return { token, hash: sha256(token) };
}

/** Hashes de IP fixos dos testes (o banco recebe só o SHA-256 da chave do IP, ACE-71). */
export const IP_HASH_1 = sha256('203.0.113.10');
export const IP_HASH_2 = sha256('198.51.100.20');

export interface CenarioConta extends Cenario {
  emailA: string;
  emailB: string;
  senhaA: string;
  senhaB: string;
  contaNaoConfirmada: string;
  emailNaoConfirmada: string;
  senhaNaoConfirmada: string;
}

export interface OpcoesCenarioConta {
  /** E-mail da conta não confirmada; um valor inválido faz a criação falhar (teste de limpeza). */
  emailNaoConfirmada?: string;
}

/**
 * Completa, como superusuário, o cenário da fundação com as senhas de A e B e a conta não
 * confirmada. A senha da não confirmada é gravada direto (o `conta_definir_senha` confirma o
 * e-mail), com o mesmo `crypt` bcrypt que as funções do banco usam.
 */
export async function completarCenarioConta(
  db: pg.Client,
  base: Cenario,
  opcoes: OpcoesCenarioConta = {},
): Promise<CenarioConta> {
  const definir = async (email: string, senha: string): Promise<string> => {
    const r = await db.query<{ id: string }>('SELECT conta_definir_senha($1, $2, false) AS id', [
      email,
      senha,
    ]);
    const id = r.rows[0]?.id;
    if (!id) throw new Error(`conta_definir_senha sem id para ${email}`);
    return id;
  };
  const idA = await definir(EMAIL_A, SENHA_A);
  const idB = await definir(EMAIL_B, SENHA_B);
  if (idA !== base.contaA || idB !== base.contaB) {
    throw new Error('conta_definir_senha devolveu outra conta que a do cenário');
  }

  const emailNaoConfirmada = opcoes.emailNaoConfirmada ?? EMAIL_NAO_CONFIRMADA;
  const r = await db.query<{ id: string }>(
    `INSERT INTO contas (email, nome, senha_hash, criada_em)
     VALUES ($1, 'Não Confirmada', crypt($2, gen_salt('bf', 4)), now()) RETURNING id`,
    [emailNaoConfirmada, SENHA_NAO_CONFIRMADA],
  );
  const contaNaoConfirmada = r.rows[0]?.id;
  if (!contaNaoConfirmada) throw new Error('Inserção da conta não confirmada sem id');

  return {
    ...base,
    emailA: EMAIL_A,
    emailB: EMAIL_B,
    senhaA: SENHA_A,
    senhaB: SENHA_B,
    contaNaoConfirmada,
    emailNaoConfirmada,
    senhaNaoConfirmada: SENHA_NAO_CONFIRMADA,
  };
}

/** `comCenario` com o cenário de conta: o banco é removido no `finally`, também quando a criação falha. */
export async function comCenarioConta<T>(
  fn: (db: pg.Client, cenario: CenarioConta, banco: Banco) => Promise<T>,
  opcoes: OpcoesCenarioConta = {},
): Promise<T> {
  return comCenario(async (db, base, banco) =>
    fn(db, await completarCenarioConta(db, base, opcoes), banco),
  );
}

export interface CenarioContaAberto extends Omit<CenarioAberto, 'cenario'> {
  cenario: CenarioConta;
}

/** `abrirCenario` com o cenário de conta, para `beforeAll`/`afterAll`. Falha na criação fecha o banco. */
export async function abrirCenarioConta(
  opcoes: OpcoesCenarioConta = {},
): Promise<CenarioContaAberto> {
  const aberto = await abrirCenario();
  try {
    const cenario = await completarCenarioConta(aberto.db, aberto.cenario, opcoes);
    return { ...aberto, cenario };
  } catch (erro) {
    await aberto.fechar();
    throw erro;
  }
}

export interface OpcoesSessao {
  escopo?: 'completo' | 'troca_de_senha';
  /** Expressões SQL relativas a `now()`, ex.: `now() - interval '20 minutes'`. */
  criadaEm?: string;
  ultimoUsoEm?: string;
  expiraEm?: string;
}

/** Grava uma sessão da conta como superusuário. Padrão: completa, criada agora, 12 h. */
export async function criarSessao(
  db: pg.Client,
  conta: string,
  opcoes: OpcoesSessao = {},
): Promise<Token> {
  const t = novoToken();
  await db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, $3, ${opcoes.criadaEm ?? 'now()'}, ${opcoes.ultimoUsoEm ?? 'now()'},
             ${opcoes.expiraEm ?? "now() + interval '12 hours'"})`,
    [t.hash, conta, opcoes.escopo ?? 'completo'],
  );
  return t;
}

export interface OpcoesLink {
  criadoEm?: string;
  expiraEm?: string;
  usadoEm?: string;
}

/** Grava um link de conta (confirmação ou recuperação) como superusuário. Padrão: pendente, vence em 1 h. */
export async function criarLink(
  db: pg.Client,
  conta: string,
  tipo: 'confirmacao' | 'recuperacao',
  opcoes: OpcoesLink = {},
): Promise<Token> {
  const t = novoToken();
  await db.query(
    `INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em, usado_em)
     VALUES ($1, $2, $3, ${opcoes.criadoEm ?? 'now()'}, ${opcoes.expiraEm ?? "now() + interval '1 hour'"},
             ${opcoes.usadoEm ?? 'NULL'})`,
    [conta, tipo, t.hash],
  );
  return t;
}

export interface OpcoesConvite {
  expiraEm?: string;
  usadoEm?: string;
  canceladoEm?: string;
}

/** Grava um convite de admin como superusuário. Padrão: pendente, vence em 7 dias. */
export async function criarConvite(
  db: pg.Client,
  grupo: string,
  email: string,
  criadoPor: string,
  opcoes: OpcoesConvite = {},
): Promise<Token & { id: string }> {
  const t = novoToken();
  const r = await db.query<{ id: string }>(
    `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em, usado_em, cancelado_em)
     VALUES ($1, $2, $3, $4, now(), ${opcoes.expiraEm ?? "now() + interval '7 days'"},
             ${opcoes.usadoEm ?? 'NULL'}, ${opcoes.canceladoEm ?? 'NULL'})
     RETURNING id`,
    [grupo, email, t.hash, criadoPor],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('Inserção do convite sem id');
  return { ...t, id };
}
