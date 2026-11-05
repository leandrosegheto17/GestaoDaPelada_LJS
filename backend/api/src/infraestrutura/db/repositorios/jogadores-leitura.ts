import { sql } from 'kysely';
import type { Posicao } from '@pelada/contrato';
import { ativosNaData, calcularNivel, compararApelido } from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Leitura de jogadores: listar e ler (T33; GEL-46, GEL-50, GEL-102). Interface de `GD:151` e decisão de `GD:287`: a
 * lista faz duas consultas (os jogadores com o período que define a situação, e as notas do grupo) e o nível sai do
 * domínio (`calcularNivel`), sem uma consulta por jogador. Datas lidas como texto (`::text`, `AAAA-MM-DD`).
 *
 * Situação e desde (GEL-46, GEL-50): ativo = há período aberto, desde o início dele; inativo = só períodos encerrados,
 * desde o fim do último. O período que define a situação é o aberto, se houver, ou o de maior início.
 *
 * Toda consulta filtra por `grupo_id`, além da RLS: um id de jogador de outro grupo não aparece (GEL-44).
 */

export interface ItemJogador {
  id: string;
  apelido: string;
  posicao: Posicao;
  situacao: 'ativo' | 'inativo';
  desde: string;
  nivel: number;
  semNota: boolean;
}

interface LinhaJogador {
  id: string;
  apelido: string;
  posicao: Posicao;
  inicio: string;
  fim: string | null;
}

/** Situação e desde a partir do período escolhido pela consulta. */
function situacaoDe(
  l: Pick<LinhaJogador, 'inicio' | 'fim'>,
): Pick<ItemJogador, 'situacao' | 'desde'> {
  return l.fim === null
    ? { situacao: 'ativo', desde: l.inicio }
    : { situacao: 'inativo', desde: l.fim };
}

/** Os jogadores do grupo, na ordem do apelido sem acento e sem caixa (GEL-47), em duas consultas. */
async function listar(db: Db, grupoId: string): Promise<ItemJogador[]> {
  const linhas = await sql<LinhaJogador>`
    SELECT j.id, j.apelido, j.posicao, p.inicio::text AS inicio, p.fim::text AS fim
      FROM jogadores j
      JOIN LATERAL (
        SELECT pa.inicio, pa.fim FROM periodos_ativos pa
         WHERE pa.jogador_id = j.id AND pa.grupo_id = j.grupo_id
         ORDER BY pa.fim IS NULL DESC, pa.inicio DESC
         LIMIT 1
      ) p ON true
     WHERE j.grupo_id = ${grupoId}`.execute(db);
  const notas = await sql<{ jogador_id: string; valor: number }>`
    SELECT jogador_id, valor FROM notas WHERE grupo_id = ${grupoId}`.execute(db);

  const porJogador = new Map<string, number[]>();
  for (const n of notas.rows) {
    const lista = porJogador.get(n.jogador_id) ?? [];
    lista.push(Number(n.valor));
    porJogador.set(n.jogador_id, lista);
  }
  return linhas.rows
    .map((l) => ({
      id: l.id,
      apelido: l.apelido,
      posicao: l.posicao,
      ...situacaoDe(l),
      ...calcularNivel(porJogador.get(l.id) ?? []),
    }))
    .sort((a, b) => compararApelido(a.apelido, b.apelido));
}

export interface PeriodoJogador {
  id: string;
  inicio: string;
  fim: string | null;
}

export interface NotaJogador {
  habilidadeId: string;
  habilidade: string;
  nota: number | null;
}

export interface DetalheJogador extends ItemJogador {
  anoNascimento: number | null;
  telefone: string | null;
  pontuacaoInicial: number;
  /** `inicio_pontuacao`, ou o início do primeiro período quando nulo. */
  inicioPontuacao: string;
  /** Do mais antigo ao mais recente. */
  periodos: PeriodoJogador[];
  /** Todas as habilidades do grupo, na ordem de cadastro, com a nota do jogador ou nulo. */
  notas: NotaJogador[];
}

/** A ficha do jogador do grupo; nulo se o jogador não é do grupo (GEL-44). */
async function ler(db: Db, grupoId: string, id: string): Promise<DetalheJogador | null> {
  const j = await sql<{
    id: string;
    apelido: string;
    posicao: Posicao;
    ano_nascimento: number | null;
    telefone: string | null;
    pontuacao_inicial: number;
    inicio_pontuacao: string | null;
  }>`
    SELECT id, apelido, posicao, ano_nascimento, telefone, pontuacao_inicial, inicio_pontuacao::text AS inicio_pontuacao
      FROM jogadores WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  const jogador = j.rows[0];
  if (!jogador) return null;

  const periodos = await sql<PeriodoJogador>`
    SELECT id, inicio::text AS inicio, fim::text AS fim FROM periodos_ativos
     WHERE grupo_id = ${grupoId} AND jogador_id = ${id}
     ORDER BY inicio, id`.execute(db);
  const notas = await sql<NotaJogador>`
    SELECT h.id AS "habilidadeId", h.nome AS habilidade, n.valor AS nota
      FROM habilidades h
      LEFT JOIN notas n ON n.habilidade_id = h.id AND n.jogador_id = ${id} AND n.grupo_id = h.grupo_id
     WHERE h.grupo_id = ${grupoId}
     ORDER BY h.ordem`.execute(db);

  const lista = periodos.rows;
  const aberto = lista.find((p) => p.fim === null);
  const ultimo =
    aberto ??
    lista.reduce<PeriodoJogador | undefined>(
      (m, p) => (!m || p.inicio > m.inicio ? p : m),
      undefined,
    );
  const primeiro = lista[0];
  const valores = notas.rows.filter((n) => n.nota !== null).map((n) => Number(n.nota));
  return {
    id: jogador.id,
    apelido: jogador.apelido,
    posicao: jogador.posicao,
    // Jogador sem período não acontece (a criação abre o primeiro); fica inativo, sem data, por segurança.
    ...(ultimo ? situacaoDe(ultimo) : { situacao: 'inativo' as const, desde: '' }),
    ...calcularNivel(valores),
    anoNascimento: jogador.ano_nascimento,
    telefone: jogador.telefone,
    pontuacaoInicial: Number(jogador.pontuacao_inicial),
    inicioPontuacao: jogador.inicio_pontuacao ?? primeiro?.inicio ?? '',
    periodos: lista,
    notas: notas.rows.map((n) => ({ ...n, nota: n.nota === null ? null : Number(n.nota) })),
  };
}

/** Jogador apto do simulador (T27 da simulador; SIM-01 a SIM-03): só o que o sorteio usa, sem telefone nem posição. */
export interface AptoDoSimulador {
  id: string;
  apelido: string;
  /** Para a idade média (SIM-95); a resposta da rota leva só `semAno`. */
  anoNascimento: number | null;
  nivel: number;
  semNota: boolean;
}

/**
 * Os jogadores ativos na data, com o nível (T27 da simulador; SIM-01, SIM-02, SIM-03), em duas consultas: os jogadores
 * com os períodos agregados, e as notas do grupo. "Ativo na data" é a regra única do domínio (`ativosNaData`, período
 * [início, fim)); o nível sai de `calcularNivel` (550 e `semNota` sem nota). Ordem do apelido sem acento nem caixa.
 * Nenhuma das consultas lê telefone ou posição.
 */
async function paraSimulador(db: Db, grupoId: string, data: string): Promise<AptoDoSimulador[]> {
  const linhas = await sql<{
    id: string;
    apelido: string;
    ano_nascimento: number | null;
    periodos: Array<{ inicio: string; fim: string | null }>;
  }>`
    SELECT j.id, j.apelido, j.ano_nascimento,
           json_agg(json_build_object('inicio', pa.inicio::text, 'fim', pa.fim::text)) AS periodos
      FROM jogadores j
      JOIN periodos_ativos pa ON pa.jogador_id = j.id AND pa.grupo_id = j.grupo_id
     WHERE j.grupo_id = ${grupoId}
     GROUP BY j.id, j.apelido, j.ano_nascimento`.execute(db);
  const notas = await sql<{ jogador_id: string; valor: number }>`
    SELECT jogador_id, valor FROM notas WHERE grupo_id = ${grupoId}`.execute(db);

  const porJogador = new Map<string, number[]>();
  for (const n of notas.rows) {
    const lista = porJogador.get(n.jogador_id) ?? [];
    lista.push(Number(n.valor));
    porJogador.set(n.jogador_id, lista);
  }
  return ativosNaData(linhas.rows, data)
    .map((l) => ({
      id: l.id,
      apelido: l.apelido,
      anoNascimento: l.ano_nascimento === null ? null : Number(l.ano_nascimento),
      ...calcularNivel(porJogador.get(l.id) ?? []),
    }))
    .sort((a, b) => compararApelido(a.apelido, b.apelido));
}

export const jogadoresLeitura = { listar, ler, paraSimulador };
