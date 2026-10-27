import pg from 'pg';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { abrirTransacaoDaRequisicao, type Db } from '../../src/infraestrutura/db/index.ts';
import { criarBancoTemporario, type BancoTemporario } from './banco.ts';

/** Banco temporário migrado, com o owner conectado e a URL de login como pelada_app (como a API em produção). */
export interface BancoDeRepositorio {
  banco: BancoTemporario;
  owner: pg.Client;
  urlApp: string;
  encerrar(): Promise<void>;
}

/**
 * Cria e migra um banco temporário e dá a pelada_app a senha de `PELADA_APP_SENHA` (a mesma do setup do Worker; a
 * role é do servidor). Os repositórios rodam como pelada_app de verdade, sob a RLS.
 */
export async function prepararBancoDeRepositorio(): Promise<BancoDeRepositorio> {
  const senha = process.env['PELADA_APP_SENHA'];
  if (!senha) throw new Error('PELADA_APP_SENHA ausente: o vitest.config deveria tê-la definido.');
  const banco = await criarBancoTemporario();
  await migrar(banco.url);
  const owner = new pg.Client({ connectionString: banco.url });
  await owner.connect();
  await owner.query(`ALTER ROLE pelada_app LOGIN PASSWORD ${owner.escapeLiteral(senha)}`);
  const url = new URL(banco.url);
  url.username = 'pelada_app';
  url.password = senha;
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return {
    banco,
    owner,
    urlApp: url.toString(),
    async encerrar() {
      await owner.end();
      await banco.remover();
    },
  };
}

/**
 * Uma "requisição": a transação da requisição como o `comBanco` abre (contexto de RLS na primeira consulta),
 * `COMMIT` se `acao` termina e `ROLLBACK` se lança.
 */
export async function comDb<T>(
  urlApp: string,
  contexto: { conta?: string },
  acao: (db: Db) => Promise<T>,
  somenteLeitura = false,
): Promise<T> {
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => urlApp,
    somenteLeitura,
    contexto: () => ({ contaId: contexto.conta }),
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
