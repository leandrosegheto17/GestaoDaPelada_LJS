import { sql } from 'kysely';
import type { Data, SituacaoComercial } from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Repositório do push (notificacoes T14; NOT-05, NOT-17, NOT-45; AD-101). As três tabelas não têm grant para
 * `pelada_app`: tudo passa pelas funções `SECURITY DEFINER` das migrações T8 a T11, chamadas pelo `Db` da transação da
 * requisição (ou do consumidor da fila), sem abrir transação própria.
 *
 * Quem usa o quê:
 * - as rotas usam só os seis primeiros métodos, que devolvem apenas texto de estado: nunca endpoint nem chaves;
 * - o consumidor da fila e o Cron (sessão sem conta e sem slug) usam o resto, e só os métodos `loteRanking` e
 *   `destinoCobranca` devolvem as chaves, para a infraestrutura de envio (`infraestrutura/push`) as cifrar. Nada
 *   daqui vai para uma resposta HTTP nem para um log (NOT-33, NOT-54).
 * Cada método confere o retorno da função contra o conjunto esperado e lança `Error` com o nome da função se vier outra
 * coisa (uma migração trocada não vira dado errado em silêncio).
 */

export type ResultadoAssinatura = 'criada' | 'atualizada' | 'limite' | 'nao_encontrado';
export type ResultadoAssinaturaConta = Exclude<ResultadoAssinatura, 'nao_encontrado'>;
export type EstadoAssinatura = 'ativa' | 'ausente' | 'nao_encontrado';
export type EstadoAssinaturaConta = Exclude<EstadoAssinatura, 'nao_encontrado'>;
export type TipoAviso = 'cobranca_gerada' | 'pagamento_confirmado' | 'pagamento_atrasado';

export interface GrupoDoEnvio {
  nome: string;
  slug: string;
  arquivado: boolean;
  /** Entradas do `planoEfetivo` do domínio, lidas na hora do envio (notificacoes T18; NOT-24, NOT-68; plano B da S-01). */
  situacaoComercial: SituacaoComercial;
  trialInicio: Data | null;
  pagoAte: Data | null;
}

/** Uma assinatura devolvida para o envio: as chaves ficam dentro da infraestrutura de push. */
export interface AssinaturaDoLote {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface DestinoCobranca {
  contaId: string;
  email: string;
  nome: string;
  grupoNome: string;
  assinaturas: AssinaturaDoLote[];
}

function conferir<T extends string>(funcao: string, valor: unknown, aceitos: readonly T[]): T {
  if (typeof valor === 'string' && (aceitos as readonly string[]).includes(valor)) return valor as T;
  throw new Error(`${funcao} devolveu um resultado inesperado`);
}

/** Ids de assinatura em `bigint[]`: texto de inteiro, para o driver montar o array sem perder precisão. */
const ids = (lista: readonly string[]): string => `{${lista.join(',')}}`;

const ASSINATURA: readonly ResultadoAssinatura[] = ['criada', 'atualizada', 'limite', 'nao_encontrado'];
const ASSINATURA_CONTA: readonly ResultadoAssinaturaConta[] = ['criada', 'atualizada', 'limite'];
const ESTADO: readonly EstadoAssinatura[] = ['ativa', 'ausente', 'nao_encontrado'];
const ESTADO_CONTA: readonly EstadoAssinaturaConta[] = ['ativa', 'ausente'];

/** Assina (ou atualiza as chaves de) um endpoint no grupo do slug do contexto público (NOT-05, NOT-07, NOT-10). */
async function assinarRanking(
  db: Db,
  slug: string,
  assinatura: { endpoint: string; p256dh: string; auth: string },
): Promise<ResultadoAssinatura> {
  const r = await sql<{ r: string }>`
    SELECT push_ranking_assinar(${slug}, ${assinatura.endpoint}, ${assinatura.p256dh}, ${assinatura.auth}) AS r`.execute(
    db,
  );
  return conferir('push_ranking_assinar', r.rows[0]?.r, ASSINATURA);
}

/** Cancela: o mesmo resultado (nenhum) com ou sem linha para apagar (NOT-17). */
async function cancelarRanking(db: Db, slug: string, endpoint: string, auth: string): Promise<void> {
  await sql`SELECT push_ranking_cancelar(${slug}, ${endpoint}, ${auth})`.execute(db);
}

async function estadoRanking(db: Db, slug: string, endpoint: string, auth: string): Promise<EstadoAssinatura> {
  const r = await sql<{ r: string }>`SELECT push_ranking_estado(${slug}, ${endpoint}, ${auth}) AS r`.execute(db);
  return conferir('push_ranking_estado', r.rows[0]?.r, ESTADO);
}

/** Assina (ou atualiza) o endpoint da conta do contexto, para os avisos de cobrança (NOT-45, AD-107). */
async function assinarConta(
  db: Db,
  assinatura: { endpoint: string; p256dh: string; auth: string },
): Promise<ResultadoAssinaturaConta> {
  const r = await sql<{ r: string }>`
    SELECT push_conta_assinar(${assinatura.endpoint}, ${assinatura.p256dh}, ${assinatura.auth}) AS r`.execute(db);
  return conferir('push_conta_assinar', r.rows[0]?.r, ASSINATURA_CONTA);
}

async function cancelarConta(db: Db, endpoint: string, auth: string): Promise<void> {
  await sql`SELECT push_conta_cancelar(${endpoint}, ${auth})`.execute(db);
}

async function estadoConta(db: Db, endpoint: string, auth: string): Promise<EstadoAssinaturaConta> {
  const r = await sql<{ r: string }>`SELECT push_conta_estado(${endpoint}, ${auth}) AS r`.execute(db);
  return conferir('push_conta_estado', r.rows[0]?.r, ESTADO_CONTA);
}

/**
 * Nome, slug, se o grupo está arquivado e as entradas do plano (NOT-24, NOT-68); `null` para grupo que não existe.
 * Sessão sem conta e sem slug. Datas como texto `AAAA-MM-DD`, como no repositório do plano.
 */
async function envioGrupo(db: Db, grupoId: string): Promise<GrupoDoEnvio | null> {
  const r = await sql<{
    nome: string;
    slug: string;
    arquivado: boolean;
    situacao_comercial: SituacaoComercial;
    trial_inicio: Data | null;
    pago_ate: Data | null;
  }>`
    SELECT nome, slug, arquivado, situacao_comercial, trial_inicio::text AS trial_inicio, pago_ate::text AS pago_ate
      FROM push_envio_grupo(${grupoId}::uuid)`.execute(db);
  const l = r.rows[0];
  if (l === undefined) return null;
  return {
    nome: l.nome,
    slug: l.slug,
    arquivado: l.arquivado,
    situacaoComercial: l.situacao_comercial,
    trialInicio: l.trial_inicio,
    pagoAte: l.pago_ate,
  };
}

/** Um lote de até `limite` assinaturas do grupo, por id crescente, só as sem envio aceito desde `desde` (NOT-69). */
async function loteRanking(
  db: Db,
  grupoId: string,
  aposId: string,
  limite: number,
  desde: string,
): Promise<AssinaturaDoLote[]> {
  const r = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }>`
    SELECT id::text AS id, endpoint, p256dh, auth
      FROM push_ranking_lote(${grupoId}::uuid, ${aposId}::bigint, ${limite}::integer, ${desde}::timestamptz)`.execute(db);
  return r.rows;
}

/** Aceitos ganham `ultimo_envio_em`; revogados somem; só do grupo do lote (NOT-29, NOT-30). */
async function resultadoRanking(
  db: Db,
  grupoId: string,
  aceitos: readonly string[],
  revogados: readonly string[],
): Promise<void> {
  await sql`SELECT push_ranking_resultado(${grupoId}::uuid, ${ids(aceitos)}::bigint[], ${ids(revogados)}::bigint[])`.execute(
    db,
  );
}

/** A criadora do grupo (não excluída) com as assinaturas de push dela; `null` sem criadora (NOT-38). */
async function destinoCobranca(db: Db, grupoId: string): Promise<DestinoCobranca | null> {
  const r = await sql<{
    conta_id: string;
    email: string;
    nome: string;
    grupo_nome: string;
    assinaturas: Array<{ id: number | string; endpoint: string; p256dh: string; auth: string }>;
  }>`SELECT conta_id, email, nome, grupo_nome, assinaturas FROM aviso_cobranca_destino(${grupoId}::uuid)`.execute(db);
  const linha = r.rows[0];
  if (!linha) return null;
  return {
    contaId: linha.conta_id,
    email: linha.email,
    nome: linha.nome,
    grupoNome: linha.grupo_nome,
    assinaturas: linha.assinaturas.map((a) => ({ ...a, id: String(a.id) })),
  };
}

/** "Uma vez por evento" (NOT-39): `true` se esta é a primeira vez da chave (id externo, tipo), `false` se já existia. */
async function registrarAviso(db: Db, idExterno: string, tipo: TipoAviso, grupoId: string): Promise<boolean> {
  const r = await sql<{ r: boolean }>`
    SELECT aviso_cobranca_registrar(${idExterno}, ${tipo}, ${grupoId}::uuid) AS r`.execute(db);
  return r.rows[0]?.r === true;
}

async function resultadoConta(
  db: Db,
  contaId: string,
  aceitos: readonly string[],
  revogados: readonly string[],
): Promise<void> {
  await sql`SELECT push_conta_resultado(${contaId}::uuid, ${ids(aceitos)}::bigint[], ${ids(revogados)}::bigint[])`.execute(
    db,
  );
}

/** A limpeza diária (NOT-56, NOT-57): quantas linhas apagou de cada tabela. Sessão sem conta e sem slug. */
async function limpar(db: Db): Promise<{ ranking: number; avisos: number }> {
  const r = await sql<{ ranking: number; avisos: number }>`SELECT ranking, avisos FROM notificacoes_limpar()`.execute(db);
  return { ranking: r.rows[0]?.ranking ?? 0, avisos: r.rows[0]?.avisos ?? 0 };
}

export const push = {
  assinarRanking,
  cancelarRanking,
  estadoRanking,
  assinarConta,
  cancelarConta,
  estadoConta,
  envioGrupo,
  loteRanking,
  resultadoRanking,
  destinoCobranca,
  registrarAviso,
  resultadoConta,
  limpar,
};
