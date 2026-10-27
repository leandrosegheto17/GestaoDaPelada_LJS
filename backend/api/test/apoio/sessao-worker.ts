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
 * Sem `grupo`: cadastro e confirmação pelo link (conta sem vínculo). Com `grupo`: convite criado pela conta do
 * cenário e cadastro pelo convite (conta com vínculo no grupo).
 */
export async function criarSessao(grupo?: IdsDoGrupo): Promise<SessaoDeTeste> {
  const sessao = await gerarToken();
  const link = await gerarToken();
  let contaId: string | null;
  if (grupo) {
    await noBanco(grupo.conta, (db) => convites.criar(db, grupo.grupo, emailNovo(), link.hash));
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
        email: emailNovo(),
        nome: 'Pessoa Sessão',
        senha: SENHA,
        termosVersao: 'teste',
        tokenHash: link.hash,
      }),
    );
    contaId = await noBanco(undefined, (db) => links.confirmar(db, link.hash, sessao.hash));
  }
  if (!contaId) throw new Error('não foi possível criar a sessão de teste');
  return { contaId, token: sessao.token, hash: sessao.hash, cookie: `__Host-sessao=${sessao.token}` };
}
