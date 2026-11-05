import { sql } from 'kysely';
import type { PartidaCorpo } from '@pelada/contrato';
import { validarMarcacoes, type ContagemDaPartida, type PresencaMarcada } from '@pelada/dominio';
import { auditoria } from './convites.ts';
import { eventos } from './eventos.ts';
import { jogadores } from './jogadores.ts';
import type { Db } from './tipos.ts';

/**
 * Partidas do grupo (T30 a T32; BD:195-204; AD-038). O `Db` é o da transação da requisição: tudo o que uma escrita
 * grava (partida, presenças, evento e auditoria) cai junto se qualquer passo falhar (PAR-28). Ordem das travas
 * (AD-038): o grupo já vem travado pelo `exigirGrupoAtivo` (`FOR KEY SHARE`); depois a partida (`FOR UPDATE`, na
 * edição e na exclusão); por último os jogadores marcados, em ordem crescente de id (`jogadores.travarVarios`).
 */

export type ResultadoLancar =
  | { resultado: 'ok'; id: string; contagem: ContagemDaPartida }
  | { resultado: 'invalido'; campos: Record<string, string> }
  | { resultado: 'partida_ja_existe' };

/** Restrição `UNIQUE (grupo_id, data)` de `partidas` (`1792843200000_linha-de-base.sql:178`). */
const UNICA_POR_DATA = 'partidas_grupo_id_data_key';

/**
 * Trava os marcados e confere as marcações contra os ativos na data (PAR-24 a PAR-27, PAR-29, PAR-48). A trava vem
 * antes da leitura dos ativos: uma correção de período concorrente do mesmo jogador termina antes ou espera esta.
 */
async function travarEValidar(
  db: Db,
  grupoId: string,
  data: string,
  marcacoes: PartidaCorpo['marcacoes'],
): Promise<
  | { ok: true; presencas: PresencaMarcada[]; contagem: ContagemDaPartida }
  | { ok: false; campos: Record<string, string> }
> {
  await jogadores.travarVarios(
    db,
    grupoId,
    marcacoes.map((m) => m.jogadorId),
  );
  const ativos = await jogadores.ativosNaData(db, grupoId, data);
  return validarMarcacoes(ativos, marcacoes);
}

/** Uma linha de presença para cada marcação gravada (PAR-23: `ausente` e ativo sem marcação não gravam linha). */
async function inserirPresencas(
  db: Db,
  grupoId: string,
  partidaId: string,
  presencas: readonly PresencaMarcada[],
) {
  if (presencas.length === 0) return;
  await sql`
    INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao)
    SELECT ${partidaId}::uuid, t.jogador_id, ${grupoId}::uuid, t.situacao
      FROM unnest(${presencas.map((p) => p.jogadorId)}::uuid[], ${presencas.map((p) => p.situacao)}::text[])
           AS t(jogador_id, situacao)`.execute(db);
}

/** O resumo da auditoria das escritas de partida: só data, chuva e contagens (PAR-142). */
function resumoDaPartida(data: string, choveu: boolean, contagem: ContagemDaPartida) {
  return {
    data,
    choveu,
    presentes: contagem.presentes,
    lesionados: contagem.lesionados,
    expulsos: contagem.expulsos,
  };
}

/**
 * Lança a partida (PAR-22 a PAR-30): trava os marcados, lê os ativos na data, valida, insere a partida, as presenças
 * gravadas, o evento `partida_lancada` e a auditoria com as contagens. A data futura (PAR-20) é recusada pela rota,
 * antes de chegar aqui.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - marcação `ausente` e ativo sem marcação: nenhuma linha de presença (PAR-23);
 * - jogador inativo na data, inexistente ou de outro grupo: `invalido` com a mesma mensagem, nada gravado (PAR-24);
 * - jogador repetido: `invalido` no campo `marcacoes` (PAR-25);
 * - partida sem nenhuma presença (todos ausentes, ou lista vazia): grava a partida e as contagens zeradas;
 * - já existe partida na data, inclusive quando outro lançamento da mesma data confirma antes (corrida): o INSERT
 *   espera o outro, o 23505 de `partidas_grupo_id_data_key` vira `partida_ja_existe` (PAR-21, PAR-30); o SAVEPOINT
 *   deixa a transação da requisição utilizável;
 * - falha depois das presenças (evento ou auditoria): o erro sobe e a transação desfaz tudo (PAR-28).
 * O evento vai por `eventos.partidaLancada` (T33; até a T33, era um INSERT direto igual).
 */
async function lancar(db: Db, grupoId: string, dados: PartidaCorpo): Promise<ResultadoLancar> {
  const v = await travarEValidar(db, grupoId, dados.data, dados.marcacoes);
  if (!v.ok) return { resultado: 'invalido', campos: v.campos };

  await sql`SAVEPOINT lancar_partida`.execute(db);
  let id: string | undefined;
  try {
    const r = await sql<{ id: string }>`
      INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
      VALUES (${grupoId}, ${dados.data}::date, ${dados.choveu}, app_conta_id(), now(), app_conta_id(), now())
      RETURNING id`.execute(db);
    id = r.rows[0]?.id;
  } catch (erro) {
    await sql`ROLLBACK TO SAVEPOINT lancar_partida`.execute(db);
    const e = erro as { code?: string; constraint?: string };
    if (e.code === '23505' && e.constraint === UNICA_POR_DATA)
      return { resultado: 'partida_ja_existe' };
    throw erro;
  }
  await sql`RELEASE SAVEPOINT lancar_partida`.execute(db);
  if (!id) throw new Error('INSERT de partida sem id');

  await inserirPresencas(db, grupoId, id, v.presencas);
  await eventos.partidaLancada(db, grupoId, dados.data);
  await auditoria.registrar(db, grupoId, {
    acao: 'partida_lancada',
    entidade: 'partida',
    entidadeId: id,
    resumo: resumoDaPartida(dados.data, dados.choveu, v.contagem),
  });
  return { resultado: 'ok', id, contagem: v.contagem };
}

export type ResultadoEditar =
  | { resultado: 'ok'; contagem: ContagemDaPartida }
  | { resultado: 'nao_encontrada' }
  | { resultado: 'data_alterada' }
  | { resultado: 'invalido'; campos: Record<string, string> };

/** A partida do grupo na data, travada (`FOR UPDATE`, AD-038); nula quando não há (PAR-45). */
async function travarPartida(db: Db, grupoId: string, data: string): Promise<string | null> {
  const r = await sql<{ id: string }>`
    SELECT id FROM partidas WHERE grupo_id = ${grupoId} AND data = ${data}::date
       FOR UPDATE`.execute(db);
  return r.rows[0]?.id ?? null;
}

/**
 * Edita a partida da data (PAR-46 a PAR-49): trava a partida, depois os marcados, valida contra os ativos **na data da
 * partida** (PAR-48), troca a chuva e a autoria da alteração, apaga e insere as presenças e audita `partida_editada`
 * com as contagens. Não grava evento de uso (PAR-49).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - sem partida na data: `nao_encontrada`, sem gravar (PAR-45);
 * - `data` do corpo diferente da do caminho: `data_alterada`, sem gravar nem travar jogador (PAR-47);
 * - jogador ativo hoje mas não na data da partida: `invalido` com a mensagem do inativo (PAR-48);
 * - todas as marcações `ausente` (ou nenhuma): a partida fica sem presenças;
 * - edição concorrente com uma correção de período do mesmo jogador: as duas travam a linha do jogador, então uma
 *   espera a outra e valida sobre o resultado dela (AD-038);
 * - falha depois da troca das presenças (auditoria): o erro sobe e a transação desfaz tudo.
 * Um jogador com presença gravada que não está mais ativo na data não chega a existir: a correção de período que o
 * tiraria da data é recusada pela grupos-e-elenco (GEL-68).
 */
async function editar(
  db: Db,
  grupoId: string,
  data: string,
  dados: PartidaCorpo,
): Promise<ResultadoEditar> {
  const partidaId = await travarPartida(db, grupoId, data);
  if (!partidaId) return { resultado: 'nao_encontrada' };
  if (dados.data !== data) return { resultado: 'data_alterada' };

  const v = await travarEValidar(db, grupoId, data, dados.marcacoes);
  if (!v.ok) return { resultado: 'invalido', campos: v.campos };

  await sql`
    UPDATE partidas SET choveu = ${dados.choveu}, alterada_por = app_conta_id(), alterada_em = now()
     WHERE grupo_id = ${grupoId} AND id = ${partidaId}`.execute(db);
  await sql`DELETE FROM presencas WHERE grupo_id = ${grupoId} AND partida_id = ${partidaId}`.execute(
    db,
  );
  await inserirPresencas(db, grupoId, partidaId, v.presencas);
  await auditoria.registrar(db, grupoId, {
    acao: 'partida_editada',
    entidade: 'partida',
    entidadeId: partidaId,
    resumo: resumoDaPartida(data, dados.choveu, v.contagem),
  });
  return { resultado: 'ok', contagem: v.contagem };
}

export type ResultadoExcluir = { resultado: 'ok' } | { resultado: 'nao_encontrada' };

/**
 * Exclui a partida da data (PAR-50, PAR-51): trava a partida, apaga (as presenças saem pelo `ON DELETE CASCADE`) e
 * audita `partida_excluida` com a data. O evento `partida_lancada` já gravado fica (PAR-51).
 */
async function excluir(db: Db, grupoId: string, data: string): Promise<ResultadoExcluir> {
  const partidaId = await travarPartida(db, grupoId, data);
  if (!partidaId) return { resultado: 'nao_encontrada' };
  await sql`DELETE FROM partidas WHERE grupo_id = ${grupoId} AND id = ${partidaId}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'partida_excluida',
    entidade: 'partida',
    entidadeId: partidaId,
    resumo: { data },
  });
  return { resultado: 'ok' };
}

// ---------------------------------------------------------------- leituras (T32)

export interface PartidaDoMesLida {
  data: string;
  choveu: boolean;
  contagem: ContagemDaPartida;
}

/**
 * As partidas do mês `AAAA-MM`, da mais recente para a mais antiga, com as contagens de presentes, lesionados e
 * expulsos (PAR-37). A navegação e o `hoje` são da rota (PAR-41).
 */
async function doMes(db: Db, grupoId: string, mes: string): Promise<PartidaDoMesLida[]> {
  const r = await sql<{
    data: string;
    choveu: boolean;
    presentes: number;
    lesionados: number;
    expulsos: number;
  }>`
    SELECT p.data::text AS data, p.choveu,
           count(*) FILTER (WHERE pr.situacao = 'presente')::int AS presentes,
           count(*) FILTER (WHERE pr.situacao = 'lesionado')::int AS lesionados,
           count(*) FILTER (WHERE pr.situacao = 'expulso')::int AS expulsos
      FROM partidas p
      LEFT JOIN presencas pr ON pr.partida_id = p.id AND pr.grupo_id = p.grupo_id
     WHERE p.grupo_id = ${grupoId}
       AND p.data >= (${mes} || '-01')::date
       AND p.data < (${mes} || '-01')::date + interval '1 month'
     GROUP BY p.id, p.data, p.choveu
     ORDER BY p.data DESC`.execute(db);
  return r.rows.map((l) => ({
    data: l.data,
    choveu: l.choveu,
    contagem: { presentes: l.presentes, lesionados: l.lesionados, expulsos: l.expulsos },
  }));
}

export interface JogadorDaPartidaLido {
  id: string;
  apelido: string;
  situacao: 'ausente' | 'presente' | 'lesionado' | 'expulso';
}

export interface PartidaLida {
  data: string;
  choveu: boolean;
  /** Nome da conta que fez a última alteração (`contas_nomes_do_grupo`, AD-036). */
  alteradaPor: string;
  /** ISO 8601. */
  alteradaEm: string;
  jogadores: JogadorDaPartidaLido[];
}

/** Apelido sem acento nem caixa, para a ordem da tela (PAR-44). */
function chaveDeOrdem(apelido: string): string {
  return apelido
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * A partida da data para a tela de edição (PAR-44): chuva, autor da última alteração pelo nome, e os jogadores ativos
 * na data mais quem já tem presença gravada nela (mesmo que hoje não esteja mais ativo na data), cada um com a
 * situação gravada ou `ausente`, pelo apelido sem acento nem caixa. Nula quando não há partida (PAR-45).
 */
async function ler(db: Db, grupoId: string, data: string): Promise<PartidaLida | null> {
  const p = await sql<{ id: string; choveu: boolean; alterada_por: string; alterada_em: Date }>`
    SELECT id, choveu, alterada_por, alterada_em FROM partidas
     WHERE grupo_id = ${grupoId} AND data = ${data}::date`.execute(db);
  const partida = p.rows[0];
  if (!partida) return null;

  const j = await sql<JogadorDaPartidaLido>`
    SELECT j.id, j.apelido, coalesce(pr.situacao, 'ausente') AS situacao
      FROM jogadores j
      LEFT JOIN presencas pr ON pr.partida_id = ${partida.id} AND pr.jogador_id = j.id AND pr.grupo_id = j.grupo_id
     WHERE j.grupo_id = ${grupoId}
       AND (pr.jogador_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM periodos_ativos pa
                        WHERE pa.grupo_id = j.grupo_id AND pa.jogador_id = j.id
                          AND pa.inicio <= ${data}::date AND (pa.fim IS NULL OR pa.fim > ${data}::date)))`.execute(
    db,
  );

  const autoras = await sql<{ id: string; nome: string }>`
    SELECT id, nome FROM contas_nomes_do_grupo(${grupoId})`.execute(db);
  const alteradaPor = autoras.rows.find((a) => a.id === partida.alterada_por)?.nome ?? '';

  const jogadoresOrdenados = [...j.rows].sort(
    (a, b) =>
      chaveDeOrdem(a.apelido).localeCompare(chaveDeOrdem(b.apelido)) || a.id.localeCompare(b.id),
  );
  return {
    data,
    choveu: partida.choveu,
    alteradaPor,
    alteradaEm: new Date(partida.alterada_em).toISOString(),
    jogadores: jogadoresOrdenados,
  };
}

/** Mês (`AAAA-MM`) da primeira partida do grupo, ou nulo sem partida: o limite da navegação (PAR-41). */
async function mesDaPrimeira(db: Db, grupoId: string): Promise<string | null> {
  const r = await sql<{ mes: string | null }>`
    SELECT to_char(min(data), 'YYYY-MM') AS mes FROM partidas WHERE grupo_id = ${grupoId}`.execute(
    db,
  );
  return r.rows[0]?.mes ?? null;
}

export const partidas = { lancar, editar, excluir, doMes, ler, mesDaPrimeira };
