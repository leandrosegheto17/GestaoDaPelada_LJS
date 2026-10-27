import { env } from 'cloudflare:test';
import { abrirTransacaoDaRequisicao, type Db } from '../../src/infraestrutura/db/index.ts';
import * as contas from '../../src/infraestrutura/db/repositorios/contas.ts';
import * as convites from '../../src/infraestrutura/db/repositorios/convites.ts';
import * as links from '../../src/infraestrutura/db/repositorios/links.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import type { IdsDoGrupo } from './cenario-dois-grupos.ts';

/** Uma transação como pelada_app pelo Hyperdrive do Worker de teste, confirmada no fim. */
export async function noBanco<T>(contaId: string | undefined, acao: (db: Db) => Promise<T>): Promise<T> {
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => env.HYPERDRIVE.connectionString,
    somenteLeitura: false,
    contexto: () => ({ contaId }),
  });
  try {
    const resultado = await acao(transacao.db);
    await transacao.terminar(true);
    return resultado;
  } catch (erro) {
    await transacao.terminar(false).catch(() => undefined);
    throw erro;
  } finally {
    await transacao.fechar();
  }
}

export interface SessaoDeTeste {
  contaId: string;
  /** E-mail e senha da conta, para entrar de novo pela rota. */
  email: string;
  senha: string;
  /** Token do cookie `__Host-sessao`. */
  token: string;
  /** SHA-256 do token (o que o banco guarda). */
  hash: Uint8Array;
  /** Cabeçalho `Cookie` pronto. */
  cookie: string;
}

const SENHA = 'senha-de-teste-1';
const emailNovo = () => `sessao-${crypto.randomUUID()}@exemplo.com`;

/**
 * Conta nova com uma sessão válida, criada só pelas funções do banco (o Worker de teste não tem o owner).
 * Sem `grupo`: cadastro, confirmação pelo link e entrada com a senha (conta sem vínculo). Com `grupo`: convite criado pela conta do
 * cenário e cadastro pelo convite (conta com vínculo no grupo).
 */
export async function criarSessao(grupo?: IdsDoGrupo): Promise<SessaoDeTeste> {
  const sessao = await gerarToken();
  const email = emailNovo();
  const link = await gerarToken();
  let contaId: string | null;
  if (grupo) {
    await noBanco(grupo.conta, (db) => convites.criar(db, grupo.grupo, email, link.hash));
    const r = await noBanco(undefined, (db) =>
      convites.cadastrar(db, {
        tokenHash: link.hash,
        nome: 'Pessoa Convidada',
        senha: SENHA,
        termosVersao: 'teste',
        tokenSessaoHash: sessao.hash,
      }),
    );
    contaId = r.contaId;
  } else {
    await noBanco(undefined, (db) =>
      contas.cadastrar(db, {
        email,
        nome: 'Pessoa Sessão',
        senha: SENHA,
        termosVersao: 'teste',
        tokenHash: link.hash,
      }),
    );
    // Confirmar o e-mail não abre sessão (ACE-06, T58): a sessão vem de entrar com a senha, como na rota.
    const confirmada = await noBanco(undefined, (db) => links.confirmar(db, link.hash));
    const ipHash = crypto.getRandomValues(new Uint8Array(32));
    const entrou = confirmada
      ? await noBanco(undefined, (db) => contas.entrar(db, { email, senha: SENHA, ipHash, tokenHash: sessao.hash }))
      : undefined;
    contaId = entrou?.resultado === 'ok' ? entrou.contaId : null;
  }
  if (!contaId) throw new Error('não foi possível criar a sessão de teste');
  return {
    contaId,
    email,
    senha: SENHA,
    token: sessao.token,
    hash: sessao.hash,
    cookie: `__Host-sessao=${sessao.token}`,
  };
}
