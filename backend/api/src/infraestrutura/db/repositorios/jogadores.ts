import { calcularNivel, compararApelido } from '@pelada/dominio';
import { sql } from 'kysely';
import type { Db } from '../index.ts';
import type { Posicao } from '../tipos.ts';

// Jogadores do grupo (grupos-e-elenco, design C5; GEL-31 a GEL-50, GEL-84, GEL-85). Todo acesso filtra por
// `grupo_id` e roda sob a RLS da conta da requisição. É o único escritor de `periodos_ativos` e de
// `jogadores.inicio_pontuacao` (GEL-83, GEL-111).

export type Situacao = 'ativo' | 'inativo';

/** Item da lista (GEL-46): ativo = período aberto (GEL-50); `desde` = início da situação atual. */
export interface JogadorResumo {
  id: string;
  apelido: string;
  /** Nula só em dado antigo anonimizado; o cadastro novo exige a posição. */
  posicao: Posicao | null;
  situacao: Situacao;
  /** Ativo: início do período aberto. Inativo: a última saída. */
  desde: string;
  /** Média das notas × 100 (GEL-101); 550 sem nota (GEL-102). */
  nivel: number;
  semNota: boolean;
}

export interface PeriodoLido {
  id: string;
  inicio: string;
  fim: string | null;
}

export interface NotaLida {
  habilidadeId: string;
  habilidade: string;
  /** Nula onde a habilidade ainda não tem nota. */
  nota: number | null;
}

/** Ficha do jogador: os dados, os períodos em ordem e a nota de cada habilidade do grupo, na ordem de cadastro. */
export interface JogadorLido extends JogadorResumo {
  anoNascimento: number | null;
  telefone: string | null;
  pontuacaoInicial: number;
  inicioPontuacao: string;
  periodos: PeriodoLido[];
  notas: NotaLida[];
}

/** Data de criação no calendário de São Paulo: só para o `desde` de quem não tem período (dado antigo). */
const criadoEmSaoPaulo = sql<string>`((j.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)::text`;

/**
 * `desde` (GEL-46, GEL-50): com período aberto, o início dele; sem, a última saída. PREMISSA: jogador sem nenhum
 * período (só em dado antigo; o cadastro sempre abre um) usa a data de início da pontuação ou, sem ela, a da criação.
 */
function situacaoDe(linha: {
  aberto_desde: string | null;
  ultima_saida: string | null;
  inicio_pontuacao: string | null;
  criado_em_sp: string;
}): { situacao: Situacao; desde: string } {
  if (linha.aberto_desde !== null) return { situacao: 'ativo', desde: linha.aberto_desde };
  return { situacao: 'inativo', desde: linha.ultima_saida ?? linha.inicio_pontuacao ?? linha.criado_em_sp };
}

/** Jogadores do grupo com período aberto e última saída, numa consulta só. */
function consultarJogadores(db: Db, grupoId: string) {
  return db
    .selectFrom('jogadores as j')
    .select([
      'j.id',
      'j.apelido',
      'j.posicao',
      'j.ano_nascimento',
      'j.telefone',
      'j.pontuacao_inicial',
      'j.inicio_pontuacao',
      criadoEmSaoPaulo.as('criado_em_sp'),
    ])
    .select((eb) => [
      eb
        .selectFrom('periodos_ativos as p')
        .select('p.inicio')
        .whereRef('p.jogador_id', '=', 'j.id')
        .where('p.fim', 'is', null)
        .as('aberto_desde'),
      eb
        .selectFrom('periodos_ativos as p')
        .select((e) => e.fn.max('p.fim').as('fim'))
        .whereRef('p.jogador_id', '=', 'j.id')
        .as('ultima_saida'),
    ])
    .where('j.grupo_id', '=', grupoId);
}

/**
 * Todos os jogadores do grupo (GEL-46), em ordem de apelido sem acento nem caixa (GEL-47), com situação (GEL-50) e
 * nível pelo domínio (GEL-101, GEL-102). Duas consultas, qualquer que seja o tamanho do elenco: os jogadores e as
 * notas do grupo.
 */
export async function listar(db: Db, grupoId: string): Promise<JogadorResumo[]> {
  const linhas = await consultarJogadores(db, grupoId).execute();
  const notas = await db.selectFrom('notas').select(['jogador_id', 'valor']).where('grupo_id', '=', grupoId).execute();
  const porJogador = new Map<string, number[]>();
  for (const n of notas) {
    const lista = porJogador.get(n.jogador_id);
    if (lista) lista.push(n.valor);
    else porJogador.set(n.jogador_id, [n.valor]);
  }
  return linhas
    .map((l): JogadorResumo => ({
      id: l.id,
      apelido: l.apelido,
      posicao: l.posicao,
      ...situacaoDe(l),
      ...calcularNivel(porJogador.get(l.id) ?? []),
    }))
    .sort(compararApelido);
}

/** A ficha do jogador do grupo; de outro grupo (ou inexistente), nulo (GEL-44). */
export async function ler(db: Db, grupoId: string, jogadorId: string): Promise<JogadorLido | null> {
  const l = await consultarJogadores(db, grupoId).where('j.id', '=', jogadorId).executeTakeFirst();
  if (!l) return null;
  const periodos = await db
    .selectFrom('periodos_ativos')
    .select(['id', 'inicio', 'fim'])
    .where('grupo_id', '=', grupoId)
    .where('jogador_id', '=', jogadorId)
    .orderBy('inicio')
    .execute();
  const notas = await db
    .selectFrom('habilidades as h')
    .leftJoin('notas as n', (j) =>
      j.onRef('n.habilidade_id', '=', 'h.id').onRef('n.grupo_id', '=', 'h.grupo_id').on('n.jogador_id', '=', jogadorId),
    )
    .select(['h.id', 'h.nome', 'n.valor'])
    .where('h.grupo_id', '=', grupoId)
    .orderBy('h.ordem')
    .execute();
  const valores = notas.flatMap((n) => (n.valor === null ? [] : [n.valor]));
  return {
    id: l.id,
    apelido: l.apelido,
    posicao: l.posicao,
    ...situacaoDe(l),
    ...calcularNivel(valores),
    anoNascimento: l.ano_nascimento,
    telefone: l.telefone,
    pontuacaoInicial: l.pontuacao_inicial,
    // Nula em dado antigo = início do primeiro período (comentário da coluna na linha de base).
    inicioPontuacao: l.inicio_pontuacao ?? periodos[0]?.inicio ?? l.criado_em_sp,
    periodos,
    notas: notas.map((n) => ({ habilidadeId: n.id, habilidade: n.nome, nota: n.valor })),
  };
}
