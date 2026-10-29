import { calcularNivel, compararApelido } from '@pelada/dominio';
import { sql } from 'kysely';
import type { Db } from '../index.ts';
import type { Posicao } from '../tipos.ts';
import * as auditoria from './auditoria.ts';

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

const MENSAGEM_APELIDO_REPETIDO = 'Já existe um jogador com esse apelido neste grupo.';

/** Dados do cadastro e da edição, já validados pelo contrato (apelido sem os espaços das pontas). */
export interface DadosJogador {
  apelido: string;
  anoNascimento: number;
  posicao: Posicao;
  telefone: string | null;
  pontuacaoInicial: number;
}

/** Recusa de um campo, com a mensagem que a tela mostra ao lado dele. */
export interface Recusa<C extends string = string> {
  ok: false;
  campo: C;
  mensagem: string;
}

const apelidoRepetido: Recusa<'apelido'> = { ok: false, campo: 'apelido', mensagem: MENSAGEM_APELIDO_REPETIDO };

/** Erro do pg com o código SQLSTATE e o nome da constraint. */
const violouApelido = (erro: unknown): boolean => {
  const e = erro as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === 'jogadores_apelido_grupo';
};

/** Outro jogador do grupo com o mesmo apelido, ignorando a caixa; acentos contam (GEL-35, mesmo critério do índice). */
async function apelidoEmUso(db: Db, grupoId: string, apelido: string, exceto?: string): Promise<boolean> {
  let consulta = db
    .selectFrom('jogadores')
    .select('id')
    .where('grupo_id', '=', grupoId)
    .where(sql<string>`lower(apelido)`, '=', sql<string>`lower(${apelido})`);
  if (exceto) consulta = consulta.where('id', '<>', exceto);
  return (await consulta.executeTakeFirst()) !== undefined;
}

/**
 * Cadastra o jogador (GEL-31, GEL-32, GEL-35, GEL-38, GEL-45): o jogador, o primeiro período aberto e
 * `inicio_pontuacao` na data de entrada (sem ela, `hoje`), e a auditoria `jogador_criado` sem telefone nem ano
 * (GEL-113). Apelido repetido é recusado pela consulta e, na corrida que passar dela, pelo índice único
 * `jogadores_apelido_grupo` (23505), com a mesma recusa.
 */
export async function criar(
  db: Db,
  grupoId: string,
  dados: DadosJogador & { dataEntrada?: string | undefined },
  hoje: string,
): Promise<{ ok: true; id: string } | Recusa<'apelido'>> {
  if (await apelidoEmUso(db, grupoId, dados.apelido)) return apelidoRepetido;
  const dataEntrada = dados.dataEntrada ?? hoje;
  let id: string;
  try {
    const linha = await db
      .insertInto('jogadores')
      .values({
        grupo_id: grupoId,
        apelido: dados.apelido,
        ano_nascimento: dados.anoNascimento,
        posicao: dados.posicao,
        telefone: dados.telefone,
        pontuacao_inicial: dados.pontuacaoInicial,
        inicio_pontuacao: dataEntrada,
        criado_por: sql<string>`app_conta_id()`,
        criado_em: sql<Date>`now()`,
        alterado_por: sql<string>`app_conta_id()`,
        alterado_em: sql<Date>`now()`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    id = linha.id;
  } catch (erro) {
    if (violouApelido(erro)) return apelidoRepetido;
    throw erro;
  }
  await db.insertInto('periodos_ativos').values({ grupo_id: grupoId, jogador_id: id, inicio: dataEntrada }).execute();
  await auditoria.registrar(db, grupoId, 'jogador_criado', 'jogador', id, {
    dataEntrada,
    pontuacaoInicial: dados.pontuacaoInicial,
  });
  return { ok: true, id };
}
