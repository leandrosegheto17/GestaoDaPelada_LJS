import { sql } from 'kysely';
import { admins, auditoria, type ListaAdmins } from '../convites.ts';
import type { Db } from '../tipos.ts';

/**
 * Conceder e retirar o acesso ao financeiro de outro admin (financeiro T22; FIN-35, FIN-36, FIN-41; AD-075). Na
 * transação da requisição:
 * - alvo = a própria conta da sessão: `propria_conta` (409 `acao_na_propria_conta`), sem consultar nada;
 * - alvo sem vínculo com o grupo (não admin, de outro grupo, inexistente): `nao_encontrado` (404);
 * - valor igual ao atual: devolve a lista sem gravar nem auditar;
 * - senão `UPDATE` e `financeiro_concedido` ou `financeiro_retirado`, com o id do alvo; devolve `admins.listar`.
 *
 * O banco é a segunda barreira (T10): a policy restritiva de `vinculos_admin` só deixa mudar a linha de outra conta e
 * só a quem tem acesso no grupo. Se a checagem daqui falhar, o `UPDATE` afeta zero linhas; isso vira `sem_permissao`
 * (a rota já barrou antes pelo `exigirFinanceiro`, então só acontece com a checagem removida) e nada é auditado.
 */

export type ResultadoAlterarFinanceiro =
  | { resultado: 'ok'; mudou: boolean; lista: ListaAdmins }
  | { resultado: 'propria_conta' | 'nao_encontrado' | 'sem_permissao' };

export interface OpcoesAlterarFinanceiro {
  /** Só para teste: pula a recusa da própria conta, para provar que o banco ainda recusa (FIN-41). */
  pularChecagemDaPropriaConta?: boolean;
}

async function alterarFinanceiro(
  db: Db,
  grupoId: string,
  alvoId: string,
  valor: boolean,
  opcoes: OpcoesAlterarFinanceiro = {},
): Promise<ResultadoAlterarFinanceiro> {
  if (!opcoes.pularChecagemDaPropriaConta) {
    const propria = await sql<{ propria: boolean }>`SELECT ${alvoId}::uuid = app_conta_id() AS propria`.execute(db);
    if (propria.rows[0]?.propria === true) return { resultado: 'propria_conta' };
  }

  const atual = await sql<{ acessa_financeiro: boolean }>`
    SELECT acessa_financeiro FROM vinculos_admin
     WHERE grupo_id = ${grupoId} AND conta_id = ${alvoId}
       FOR UPDATE`.execute(db);
  const vinculo = atual.rows[0];
  if (!vinculo) return { resultado: 'nao_encontrado' };
  if (vinculo.acessa_financeiro === valor) return { resultado: 'ok', mudou: false, lista: await admins.listar(db, grupoId) };

  const r = await sql`
    UPDATE vinculos_admin SET acessa_financeiro = ${valor}
     WHERE grupo_id = ${grupoId} AND conta_id = ${alvoId}`.execute(db);
  if (Number(r.numAffectedRows ?? 0) === 0) return { resultado: 'sem_permissao' };

  await auditoria.registrar(db, grupoId, {
    acao: valor ? 'financeiro_concedido' : 'financeiro_retirado',
    entidade: 'vinculo_admin',
    entidadeId: alvoId,
  });
  return { resultado: 'ok', mudou: true, lista: await admins.listar(db, grupoId) };
}

export const acessoFinanceiro = { alterarFinanceiro };
