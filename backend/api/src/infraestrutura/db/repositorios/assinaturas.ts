import { sql } from 'kysely';
import type { SituacaoAssinatura } from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Repositório de assinaturas (planos-e-cobranca T31; PLA-30, PLA-33; AD-096, AD-097). As escritas passam só pelas
 * funções `SECURITY DEFINER` da T14 (`assinatura_registrar`, `assinatura_cancelar`): a `pelada_app` não tem INSERT nem
 * UPDATE em `assinaturas` (T10). As leituras vão pela RLS `assinaturas_ler` (só com conta e grupo visível).
 *
 * Erros das funções (T14) viram resultado, dentro de um SAVEPOINT para a transação da requisição seguir utilizável:
 * - 42501 (sem conta, conta que não criou o grupo, grupo inexistente): `so_quem_criou`;
 * - 55000 (grupo arquivado, só no registrar): `grupo_arquivado`;
 * - 23505 do índice `assinaturas_uma_vigente` (já há pendente ou ativa, PLA-33): `assinatura_vigente`;
 * - P0002 (cancelar sem assinatura vigente): `sem_assinatura`;
 * - outro erro sobe.
 *
 * `travarGrupo` serializa assinar e cancelar do mesmo grupo (AD-097): duas criadoras não abrem duas assinaturas no
 * Asaas ao mesmo tempo; a chave é separada das outras travas por grupo (`jogadores_ativos:`, `financeiro_config:`).
 */

export interface AssinaturaPendenteOuAtiva {
  id: string;
  situacao: Extract<SituacaoAssinatura, 'aguardando_pagamento' | 'ativa'>;
  faturaUrl: string | null;
  asaasAssinaturaId: string;
}

export interface DadosRegistro {
  clienteId: string;
  assinaturaId: string;
  valorCentavos: number;
  faturaUrl: string | null;
}

export type ResultadoRegistrar =
  | { resultado: 'ok'; id: string }
  | { resultado: 'so_quem_criou' | 'grupo_arquivado' | 'assinatura_vigente' };

export type ResultadoCancelar =
  | { resultado: 'ok'; situacaoAnterior: Extract<SituacaoAssinatura, 'aguardando_pagamento' | 'ativa'> }
  | { resultado: 'so_quem_criou' | 'sem_assinatura' };

function codigo(erro: unknown): string | undefined {
  return (erro as { code?: string } | null)?.code;
}

/** A assinatura `aguardando_pagamento` ou `ativa` do grupo (o índice deixa só uma), ou `null`. */
async function pendenteOuAtiva(db: Db, grupoId: string): Promise<AssinaturaPendenteOuAtiva | null> {
  const r = await sql<{
    id: string;
    situacao: AssinaturaPendenteOuAtiva['situacao'];
    fatura_url: string | null;
    asaas_assinatura_id: string;
  }>`
    SELECT id, situacao, fatura_url, asaas_assinatura_id
      FROM assinaturas
     WHERE grupo_id = ${grupoId}::uuid AND situacao IN ('aguardando_pagamento', 'ativa')
     ORDER BY criada_em DESC, id
     LIMIT 1`.execute(db);
  const l = r.rows[0];
  if (l === undefined) return null;
  return { id: l.id, situacao: l.situacao, faturaUrl: l.fatura_url, asaasAssinaturaId: l.asaas_assinatura_id };
}

/**
 * O cliente do Asaas da conta (AD-096): o `asaas_cliente_id` mais recente das assinaturas dos grupos que a conta
 * criou, em qualquer situação. `null` quando ela nunca assinou.
 */
async function clienteDaConta(db: Db, contaId: string): Promise<string | null> {
  const r = await sql<{ asaas_cliente_id: string }>`
    SELECT a.asaas_cliente_id
      FROM assinaturas a
      JOIN grupos g ON g.id = a.grupo_id
     WHERE g.criado_por = ${contaId}::uuid
     ORDER BY a.criada_em DESC, a.id
     LIMIT 1`.execute(db);
  return r.rows[0]?.asaas_cliente_id ?? null;
}

/** Grava a assinatura `aguardando_pagamento` pela `assinatura_registrar` (T14), com a auditoria na mesma transação. */
async function registrar(db: Db, grupoId: string, dados: DadosRegistro): Promise<ResultadoRegistrar> {
  await sql`SAVEPOINT assinatura_registrar`.execute(db);
  try {
    const r = await sql<{ id: string }>`
      SELECT assinatura_registrar(${grupoId}::uuid, ${dados.clienteId}, ${dados.assinaturaId},
                                  ${dados.valorCentavos}::integer, ${dados.faturaUrl}) AS id`.execute(db);
    await sql`RELEASE SAVEPOINT assinatura_registrar`.execute(db);
    const id = r.rows[0]?.id;
    if (id === undefined) throw new Error('assinatura_registrar sem retorno');
    return { resultado: 'ok', id };
  } catch (erro) {
    await sql`ROLLBACK TO SAVEPOINT assinatura_registrar`.execute(db);
    switch (codigo(erro)) {
      case '42501':
        return { resultado: 'so_quem_criou' };
      case '55000':
        return { resultado: 'grupo_arquivado' };
      case '23505':
        return { resultado: 'assinatura_vigente' };
      default:
        throw erro;
    }
  }
}

/** Cancela a assinatura vigente pela `assinatura_cancelar` (T14); devolve a situação que ela tinha. */
async function cancelar(db: Db, grupoId: string): Promise<ResultadoCancelar> {
  await sql`SAVEPOINT assinatura_cancelar`.execute(db);
  try {
    const r = await sql<{ anterior: 'aguardando_pagamento' | 'ativa' }>`
      SELECT assinatura_cancelar(${grupoId}::uuid) AS anterior`.execute(db);
    await sql`RELEASE SAVEPOINT assinatura_cancelar`.execute(db);
    const anterior = r.rows[0]?.anterior;
    if (anterior === undefined) throw new Error('assinatura_cancelar sem retorno');
    return { resultado: 'ok', situacaoAnterior: anterior };
  } catch (erro) {
    await sql`ROLLBACK TO SAVEPOINT assinatura_cancelar`.execute(db);
    switch (codigo(erro)) {
      case '42501':
        return { resultado: 'so_quem_criou' };
      case 'P0002':
        return { resultado: 'sem_assinatura' };
      default:
        throw erro;
    }
  }
}

/** Trava de assinatura do grupo até o fim da transação (AD-097). */
async function travarGrupo(db: Db, grupoId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`assinatura:${grupoId}`}, 0))`.execute(db);
}

export const assinaturas = { pendenteOuAtiva, clienteDaConta, registrar, cancelar, travarGrupo };
