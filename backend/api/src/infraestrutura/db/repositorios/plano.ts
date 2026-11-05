import { sql } from 'kysely';
import type { Data, GrupoDaCriadora, SituacaoAssinatura, SituacaoComercial } from '@pelada/dominio';
import type { LinhaGrupoDaCriadora, LinhaPlanoDoGrupo } from '../tipos.ts';
import type { Db } from './tipos.ts';

/**
 * Leitura do plano (planos-e-cobranca T20; PLA-07, PLA-17; AD-088). Só lê os dados de entrada do domínio pelas funções
 * da T12 (`plano_do_grupo`, `plano_grupos_da_criadora`), na transação da requisição; quem decide o plano é o
 * `planoEfetivo` do domínio (PLA-01), chamado pelo ponto único `recursoLiberado` (T21). Nenhuma decisão de plano aqui.
 *
 * Datas como texto `AAAA-MM-DD` (`::text`) e `criado_em` como ISO 8601 em UTC com microssegundos, para a ordem do
 * texto ser a do tempo (o desempate do excedente compara texto, `excedente.ts`).
 */

/** Os dados do grupo que o domínio precisa para decidir o plano e o excedente. */
export interface DadosDoPlano {
  situacaoComercial: SituacaoComercial;
  trialInicio: Data | null;
  pagoAte: Data | null;
  criadoPor: string;
  criadoEm: string;
  jogadoresAtivos: number;
}

/** Um grupo não arquivado da criadora, com o que o domínio precisa para saber se ele está no Free. */
export interface GrupoDaCriadoraComPlano extends GrupoDaCriadora {
  situacaoComercial: SituacaoComercial;
  trialInicio: Data | null;
  pagoAte: Data | null;
}

const CRIADO_EM_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/** Dados do plano do grupo; `null` quando o grupo não existe ou não é visível para o contexto (conta ou slug). */
async function ler(db: Db, grupoId: string): Promise<DadosDoPlano | null> {
  const r = await sql<Omit<LinhaPlanoDoGrupo, 'criado_em'> & { criado_em: string }>`
    SELECT situacao_comercial,
           trial_inicio::text AS trial_inicio,
           pago_ate::text AS pago_ate,
           criado_por,
           to_char(criado_em AT TIME ZONE 'UTC', ${sql.raw(CRIADO_EM_ISO)}) AS criado_em,
           jogadores_ativos
      FROM plano_do_grupo(${grupoId}::uuid)`.execute(db);
  const l = r.rows[0];
  if (l === undefined) return null;
  return {
    situacaoComercial: l.situacao_comercial,
    trialInicio: l.trial_inicio,
    pagoAte: l.pago_ate,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em,
    jogadoresAtivos: Number(l.jogadores_ativos),
  };
}

/**
 * Os grupos não arquivados de quem criou `grupoId` (PLA-17), do mais antigo ao mais novo. Vale também para a admin
 * convidada, que não enxerga os outros grupos da criadora pela RLS. Lista vazia sem conta ou para grupo não visível.
 */
async function gruposDaCriadora(db: Db, grupoId: string): Promise<GrupoDaCriadoraComPlano[]> {
  const r = await sql<Omit<LinhaGrupoDaCriadora, 'criado_em'> & { criado_em: string }>`
    SELECT id,
           to_char(criado_em AT TIME ZONE 'UTC', ${sql.raw(CRIADO_EM_ISO)}) AS criado_em,
           situacao_comercial,
           trial_inicio::text AS trial_inicio,
           pago_ate::text AS pago_ate
      FROM plano_grupos_da_criadora(${grupoId}::uuid)`.execute(db);
  return r.rows.map((l) => ({
    id: l.id,
    criadoEm: l.criado_em,
    situacaoComercial: l.situacao_comercial,
    trialInicio: l.trial_inicio,
    pagoAte: l.pago_ate,
  }));
}

/** A assinatura que Meu plano mostra (T24; PLA-08, AD-096). */
export interface AssinaturaVigente {
  situacao: SituacaoAssinatura;
  faturaUrl: string | null;
}

/**
 * A assinatura não cancelada mais recente do grupo ou, sem ela, a cancelada mais recente (a mesma ordem do `pago_ate`
 * de `plano_do_grupo`, T12). `null` sem assinatura. Pela RLS de `assinaturas` (T11): só as do grupo com vínculo.
 */
async function assinaturaVigente(db: Db, grupoId: string): Promise<AssinaturaVigente | null> {
  const r = await sql<{ situacao: SituacaoAssinatura; fatura_url: string | null }>`
    SELECT situacao, fatura_url
      FROM assinaturas
     WHERE grupo_id = ${grupoId}::uuid
     ORDER BY (situacao <> 'cancelada') DESC, criada_em DESC, id
     LIMIT 1`.execute(db);
  const l = r.rows[0];
  return l === undefined ? null : { situacao: l.situacao, faturaUrl: l.fatura_url };
}

export const plano = { ler, gruposDaCriadora, assinaturaVigente };
