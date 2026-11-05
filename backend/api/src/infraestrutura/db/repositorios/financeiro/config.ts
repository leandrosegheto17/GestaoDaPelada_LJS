import { sql } from 'kysely';
import { auditoria } from '../convites.ts';
import type { Db } from '../tipos.ts';

/**
 * Configuração do caixa do grupo (financeiro T16; FIN-01, FIN-04, FIN-05, FIN-06; AD-078). Uma linha por grupo em
 * `config_financeira`: mensalidade (ou nula), saldo inicial e a data a partir da qual o saldo conta. Valores em
 * centavos inteiros; a data é lida e escrita como texto `AAAA-MM-DD`.
 *
 * Gravar é um comando só na transação da requisição: o `pg_advisory_xact_lock` por grupo serializa as gravações
 * (`FOR UPDATE` não trava quando a linha ainda não existe, e duas primeiras gravações simultâneas leriam "sem antes"
 * as duas); com o lock, lê a anterior, faz `INSERT … ON CONFLICT (grupo_id) DO UPDATE` e audita
 * `financeiro_config_alterada` com os três campos antes e depois (nulo no antes da primeira gravação). A auditoria
 * usa a conta da sessão (`app_conta_id()`) e `now()`, como os demais repositórios.
 *
 * Mudar a mensalidade não toca em lançamento nenhum (FIN-05): o valor de um lançamento de mensalidade é o do dia em
 * que o pagamento foi marcado.
 *
 * Toda consulta filtra por `grupo_id`, além da RLS (`financeiro-rls`: só quem tem `acessa_financeiro`).
 */

export interface ConfigFinanceira {
  mensalidadeCentavos: number | null;
  saldoInicialCentavos: number;
  /** `AAAA-MM-DD`. */
  dataSaldoInicial: string;
}

interface Linha {
  mensalidade_centavos: number | null;
  saldo_inicial_centavos: number;
  data_saldo_inicial: string;
}

function daLinha(l: Linha): ConfigFinanceira {
  return {
    mensalidadeCentavos: l.mensalidade_centavos === null ? null : Number(l.mensalidade_centavos),
    saldoInicialCentavos: Number(l.saldo_inicial_centavos),
    dataSaldoInicial: l.data_saldo_inicial,
  };
}

/** A configuração do grupo; nulo se o caixa ainda não foi configurado (FIN-08). */
async function lerConfig(db: Db, grupoId: string): Promise<ConfigFinanceira | null> {
  const r = await sql<Linha>`
    SELECT mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial::text AS data_saldo_inicial
      FROM config_financeira WHERE grupo_id = ${grupoId}`.execute(db);
  const linha = r.rows[0];
  return linha ? daLinha(linha) : null;
}

export interface ResultadoSalvarConfig {
  /** A configuração anterior; nulo na primeira gravação. */
  antes: ConfigFinanceira | null;
  depois: ConfigFinanceira;
}

/**
 * Cria ou substitui a configuração do grupo e audita antes e depois, na mesma transação (FIN-01, FIN-04, FIN-06).
 * SPEC_DEVIATION: sem `contaId` e `agora` na assinatura (a tarefa os previa): a autora vem de `app_conta_id()` e o
 * momento de `now()`, como em `auditoria.registrar`, e `config_financeira` não tem colunas de autoria.
 */
async function salvarConfig(
  db: Db,
  grupoId: string,
  dados: ConfigFinanceira,
): Promise<ResultadoSalvarConfig> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`financeiro_config:${grupoId}`}, 0))`.execute(
    db,
  );
  const antes = await lerConfig(db, grupoId);

  await sql`
    INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
    VALUES (${grupoId}, ${dados.mensalidadeCentavos}, ${dados.saldoInicialCentavos}, ${dados.dataSaldoInicial}::date)
    ON CONFLICT (grupo_id) DO UPDATE
      SET mensalidade_centavos = EXCLUDED.mensalidade_centavos,
          saldo_inicial_centavos = EXCLUDED.saldo_inicial_centavos,
          data_saldo_inicial = EXCLUDED.data_saldo_inicial`.execute(db);

  const depois: ConfigFinanceira = {
    mensalidadeCentavos: dados.mensalidadeCentavos,
    saldoInicialCentavos: dados.saldoInicialCentavos,
    dataSaldoInicial: dados.dataSaldoInicial,
  };
  await auditoria.registrar(db, grupoId, {
    acao: 'financeiro_config_alterada',
    entidade: 'config_financeira',
    entidadeId: grupoId,
    resumo: { antes, depois },
  });
  return { antes, depois };
}

export const configFinanceira = { lerConfig, salvarConfig };
