import { sql } from 'kysely';
import type { DadosGrupo } from '@pelada/contrato';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Escritas do grupo: editar, arquivar e reativar (T27; GEL-18, GEL-22 a GEL-24, GEL-28 a GEL-30, SEC-008). Decisão de
 * `GD:150` (travar a linha, conferir `criado_por`, idempotente, gravar e auditar) e risco de `GD:271` (o vínculo da
 * própria conta lido com `FOR KEY SHARE`, para a remoção concorrente da criadora esperar). Tudo na transação da
 * requisição, depois do `exigirVinculo` e do `exigirGrupoAtivo` (que já leu o grupo com `FOR KEY SHARE`, SEC-007).
 *
 * Casos limite e estados (Domínio: sim), listados antes do código:
 * - ativo → arquivado (criadora, nome exato): grava `arquivado_em`, audita `grupo_arquivado`; nada é apagado (GEL-30);
 * - arquivado → arquivado: 200 sem gravar nem auditar (GEL-29);
 * - arquivado → ativo (criadora): apaga `arquivado_em`, audita `grupo_reativado`; vínculos, jogadores, habilidades,
 *   notas e slug ficam como estavam (GEL-28);
 * - ativo → ativo: 200 sem gravar nem auditar (GEL-29);
 * - nome com caixa ou espaço diferente ("pelada de quinta", " Pelada de Quinta"): `nome_nao_confere` (GEL-23); a
 *   comparação é exata, sem trim nem normalização;
 * - O (admin que não criou) pedindo arquivar ou reativar: `so_quem_criou`, sem gravar (GEL-24), antes de olhar o nome;
 * - criadora removida do grupo (sem vínculo): `nao_encontrado` (`GS:392`); em corrida com a remoção, o `FOR KEY SHARE`
 *   do vínculo faz a remoção esperar esta transação (ou esta ver o vínculo já apagado);
 * - grupo que a RLS não mostra: `nao_encontrado`.
 *
 * [LACUNA] arquivar um grupo já arquivado com o nome errado: a spec não diz se vale o 200 do GEL-29 ou o 422 do
 * GEL-23. O rascunho confere o nome antes do estado (interpretação conservadora: nada passa sem a confirmação).
 *
 * [LACUNA] dois arquivar (ou reativar) simultâneos do mesmo grupo: cada um já tem o `FOR KEY SHARE` do
 * `exigirGrupoAtivo` e pede `FOR UPDATE`, que espera o `FOR KEY SHARE` do outro; o Postgres derruba um com 40P01
 * (500). A spec não define o resultado; o rascunho não trata.
 *
 * Travas: arquivar e reativar pegam `FOR UPDATE` na linha do grupo, que espera a escrita em curso com `FOR KEY SHARE`
 * (SEC-007, T25). Editar pega `FOR NO KEY UPDATE`, que não conflita com o `FOR KEY SHARE` de outra escrita: com
 * `FOR UPDATE`, dois PATCH simultâneos (cada um com o `FOR KEY SHARE` do middleware) esperariam um ao outro
 * (`GSEG:163`). SPEC_DEVIATION: `GD:150` diz `FOR UPDATE` para todas; vale `FOR NO KEY UPDATE` no editar, pelo
 * motivo acima.
 */

export type ResultadoEdicao = { resultado: 'ok'; mudou: boolean } | { resultado: 'nao_encontrado' };

export type ResultadoEstado =
  | { resultado: 'ok'; mudou: boolean }
  | { resultado: 'nao_encontrado' | 'so_quem_criou' | 'nome_nao_confere' };

interface LinhaGrupo {
  nome: string;
  diaSemana: string;
  frequencia: string;
  horario: string;
  criadoPor: string;
  arquivado: boolean;
  souCriador: boolean;
}

const CAMPOS = ['nome', 'diaSemana', 'frequencia', 'horario'] as const;

/** Grava os dados do grupo e audita `grupo_editado` só com os nomes dos campos alterados (SEC-008, GEL-113). */
async function editar(db: Db, grupoId: string, dados: DadosGrupo): Promise<ResultadoEdicao> {
  const r = await sql<Pick<LinhaGrupo, 'nome' | 'diaSemana' | 'frequencia' | 'horario'>>`
    SELECT nome, dia_semana AS "diaSemana", frequencia, to_char(horario, 'HH24:MI') AS horario
      FROM grupos WHERE id = ${grupoId}
       FOR NO KEY UPDATE`.execute(db);
  const atual = r.rows[0];
  if (!atual) return { resultado: 'nao_encontrado' };
  const campos = CAMPOS.filter((campo) => atual[campo] !== dados[campo]);
  if (campos.length === 0) return { resultado: 'ok', mudou: false };
  await sql`
    UPDATE grupos
       SET nome = ${dados.nome}, dia_semana = ${dados.diaSemana}, frequencia = ${dados.frequencia},
           horario = ${dados.horario}::time
     WHERE id = ${grupoId}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'grupo_editado',
    entidade: 'grupo',
    entidadeId: grupoId,
    resumo: { campos },
  });
  return { resultado: 'ok', mudou: true };
}

/** Linha do grupo travada com `FOR UPDATE` e o vínculo da conta com `FOR KEY SHARE`; nulo sem um dos dois. */
async function travarComoCriadora(db: Db, grupoId: string): Promise<LinhaGrupo | null> {
  const r = await sql<LinhaGrupo>`
    SELECT nome, dia_semana AS "diaSemana", frequencia, to_char(horario, 'HH24:MI') AS horario,
           criado_por AS "criadoPor", arquivado_em IS NOT NULL AS arquivado,
           criado_por = app_conta_id() AS "souCriador"
      FROM grupos WHERE id = ${grupoId}
       FOR UPDATE`.execute(db);
  const grupo = r.rows[0];
  if (!grupo) return null;
  const vinculo = await sql<{ conta_id: string }>`
    SELECT conta_id FROM vinculos_admin
     WHERE grupo_id = ${grupoId} AND conta_id = app_conta_id()
       FOR KEY SHARE`.execute(db);
  if (vinculo.rows.length === 0) return null;
  return { ...grupo, souCriador: grupo.souCriador === true };
}

/** Arquiva o grupo (GEL-22): só a criadora, com o nome exato; idempotente (GEL-29). */
async function arquivar(
  db: Db,
  grupoId: string,
  nomeConfirmacao: string,
): Promise<ResultadoEstado> {
  const grupo = await travarComoCriadora(db, grupoId);
  if (!grupo) return { resultado: 'nao_encontrado' };
  if (!grupo.souCriador) return { resultado: 'so_quem_criou' };
  if (nomeConfirmacao !== grupo.nome) return { resultado: 'nome_nao_confere' };
  if (grupo.arquivado) return { resultado: 'ok', mudou: false };
  await sql`UPDATE grupos SET arquivado_em = now() WHERE id = ${grupoId}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'grupo_arquivado',
    entidade: 'grupo',
    entidadeId: grupoId,
  });
  return { resultado: 'ok', mudou: true };
}

/** Reativa o grupo (GEL-28): só a criadora; idempotente (GEL-29). Só a marca muda. */
async function reativar(db: Db, grupoId: string): Promise<ResultadoEstado> {
  const grupo = await travarComoCriadora(db, grupoId);
  if (!grupo) return { resultado: 'nao_encontrado' };
  if (!grupo.souCriador) return { resultado: 'so_quem_criou' };
  if (!grupo.arquivado) return { resultado: 'ok', mudou: false };
  await sql`UPDATE grupos SET arquivado_em = NULL WHERE id = ${grupoId}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'grupo_reativado',
    entidade: 'grupo',
    entidadeId: grupoId,
  });
  return { resultado: 'ok', mudou: true };
}

export const gruposEstado = { editar, arquivar, reativar };
