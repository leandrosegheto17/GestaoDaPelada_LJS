import { sql } from 'kysely';
import type { EventoPublicoCorpo, SemanaDeUso } from '@pelada/contrato';
import type { Db } from './tipos.ts';

/**
 * Eventos de uso (T33; PAR-127, PAR-132, PAR-155 a PAR-158; BD:205-207; B:74, B:475-478). `eventos_uso` só aceita
 * inserção (T23): com conta, pela RLS; do contexto público, só pela `evento_publico_registrar`.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - a semana é de segunda a domingo do momento do registro em America/Sao_Paulo (PAR-156): domingo 23:30 em São Paulo
 *   (segunda 02:30 em UTC) fica na semana do domingo; segunda 00:30 em São Paulo abre a semana seguinte;
 * - `aparelhosRanking` conta `dispositivo_id` distintos (PAR-157): dois `ranking_aberto` do mesmo aparelho contam 1;
 * - `partidasEm48h` (PAR-158): `partida_lancada` com momento até 48 h depois da data da partida mais o horário do
 *   grupo, em São Paulo; exatamente 48 h ainda conta; depois, não;
 * - só as semanas que têm evento aparecem (PAR-155), da mais recente para a mais antiga;
 * - `escalacoesConfirmadas` conta os `escalacao_confirmada` da semana (simulador T30; SIM-70, `S:281`): duas
 *   confirmações da mesma data contam 2 (cada confirmação grava um evento, T28).
 *
 * [LACUNA] semana que só tem `escalacao_confirmada`: a Base não diz se aparece com o resto zerado. Interpretação do
 * simulador T30: aparece, porque confirmar a escalação é uso do app (o painel "Uso do app" do Independent Test de
 * SIM-69/SIM-70 a mostra); o /executar confirma com o usuário.
 */

/** Grava `partida_lancada` com a data da partida, com conta (PAR-28). O momento é o da transação. */
async function partidaLancada(db: Db, grupoId: string, data: string): Promise<void> {
  await sql`
    INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida)
    VALUES (${grupoId}, 'partida_lancada', now(), ${data}::date)`.execute(db);
}

/**
 * Evento anônimo da página pública (PAR-127): chama a `evento_publico_registrar` com o slug do contexto e o momento do
 * relógio. Devolve `false` quando o grupo do slug não existe ou está arquivado (nada gravado).
 */
async function registrarPublico(
  db: Db,
  slug: string,
  evento: EventoPublicoCorpo,
  momento: string,
): Promise<boolean> {
  const dispositivo = evento.tipo === 'ranking_aberto' ? evento.dispositivoId : null;
  const mes = evento.tipo === 'pdf_exportado' ? evento.mes : null;
  const r = await sql<{ ok: boolean }>`
    SELECT evento_publico_registrar(${slug}, ${evento.tipo}, ${dispositivo}::uuid, ${mes}, ${momento}::timestamptz) AS ok`.execute(
    db,
  );
  return r.rows[0]?.ok === true;
}

/** O painel de uso do grupo (PAR-155 a PAR-158), da semana mais recente para a mais antiga. */
async function porSemana(db: Db, grupoId: string): Promise<SemanaDeUso[]> {
  const r = await sql<{
    inicio: string;
    fim: string;
    aparelhos: number;
    pdfs: number;
    partidas: number;
    em48h: number;
    escalacoes: number;
  }>`
    SELECT s.inicio::text AS inicio, (s.inicio + 6)::text AS fim,
           count(DISTINCT e.dispositivo_id) FILTER (WHERE e.tipo = 'ranking_aberto')::int AS aparelhos,
           count(*) FILTER (WHERE e.tipo = 'pdf_exportado')::int AS pdfs,
           count(*) FILTER (WHERE e.tipo = 'partida_lancada')::int AS partidas,
           count(*) FILTER (
             WHERE e.tipo = 'partida_lancada'
               AND e.momento <= ((e.data_partida + g.horario) AT TIME ZONE 'America/Sao_Paulo') + interval '48 hours'
           )::int AS em48h,
           count(*) FILTER (WHERE e.tipo = 'escalacao_confirmada')::int AS escalacoes
      FROM eventos_uso e
      JOIN grupos g ON g.id = e.grupo_id
     CROSS JOIN LATERAL (
       SELECT date_trunc('week', e.momento AT TIME ZONE 'America/Sao_Paulo')::date AS inicio
     ) s
     WHERE e.grupo_id = ${grupoId}
       AND e.tipo IN ('ranking_aberto', 'pdf_exportado', 'partida_lancada', 'escalacao_confirmada')
     GROUP BY s.inicio
     ORDER BY s.inicio DESC`.execute(db);
  return r.rows.map((l) => ({
    inicio: l.inicio,
    fim: l.fim,
    aparelhosRanking: l.aparelhos,
    pdfsExportados: l.pdfs,
    partidasLancadas: l.partidas,
    partidasEm48h: l.em48h,
    escalacoesConfirmadas: l.escalacoes,
  }));
}

/** Aparelhos distintos com `ranking_aberto` na semana (segunda a domingo, São Paulo) que contém `hoje` (PAR-132). */
async function aparelhosDaSemana(db: Db, grupoId: string, hoje: string): Promise<number> {
  const r = await sql<{ n: number }>`
    SELECT count(DISTINCT dispositivo_id)::int AS n
      FROM eventos_uso
     WHERE grupo_id = ${grupoId}
       AND tipo = 'ranking_aberto'
       AND date_trunc('week', momento AT TIME ZONE 'America/Sao_Paulo')::date = date_trunc('week', ${hoje}::date::timestamp)::date`.execute(
    db,
  );
  return r.rows[0]?.n ?? 0;
}

export const eventos = { partidaLancada, registrarPublico, porSemana, aparelhosDaSemana };
