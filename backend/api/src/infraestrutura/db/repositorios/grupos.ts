import { HABILIDADES_INICIAIS } from '@pelada/dominio';
import { sql } from 'kysely';
import type { Db } from '../index.ts';
import type { DiaSemana, Frequencia } from '../tipos.ts';

// Grupos (grupos-e-elenco, design C5; GEL-01, GEL-18 a GEL-30). A conta da requisição e a RLS decidem o que se vê:
// com a grupos_visiveis() da T17, o grupo arquivado só é visível à conta criadora que ainda é admin (GEL-25).

export interface DadosGrupo {
  nome: string;
  diaSemana: DiaSemana;
  frequencia: Frequencia;
  /** `HH:MM`. */
  horario: string;
}

export interface GrupoItem extends DadosGrupo {
  id: string;
  slug: string;
}

export interface GruposDaConta {
  ativos: GrupoItem[];
  /** Só os arquivados que a conta criou (GEL-27). */
  arquivados: GrupoItem[];
}

export interface GrupoLido extends GrupoItem {
  arquivado: boolean;
  jogadoresAtivos: number;
  habilidades: number;
  admins: number;
  souCriador: boolean;
}

/** `time` volta como `HH:MM:SS`; a API fala `HH:MM`. */
const horaMinuto = (horario: string) => horario.slice(0, 5);

/**
 * Cria o grupo pela função `grupo_criar` (a policy de INSERT não deixa a pelada_app criar um grupo sem vínculo):
 * grupo, vínculo de admin com o financeiro, habilidades na ordem dada e auditoria `grupo_criado`, numa chamada só
 * (GEL-01, GEL-02, GEL-09, GEL-10); as habilidades são as iniciais do domínio. O sufixo livre do slug é escolhido no banco (GEL-14, GEL-15).
 */
export async function criar(db: Db, dados: DadosGrupo, slugBase: string): Promise<{ id: string; slug: string }> {
  const { rows } = await sql<{ id: string; slug: string }>`
    SELECT id, slug FROM grupo_criar(${dados.nome}, ${dados.diaSemana}, ${dados.frequencia}, ${dados.horario}::time,
                                     ${slugBase}, ${[...HABILIDADES_INICIAIS]}::text[])
  `.execute(db);
  const criado = rows[0];
  if (!criado) throw new Error('grupo_criar não devolveu linha');
  return criado;
}

/**
 * Grupos em que a conta da requisição tem vínculo: os ativos e, à parte, os arquivados que ela criou (GEL-25, GEL-27).
 * A RLS já esconde o arquivado de quem não criou; o filtro de `criado_por` repete a regra aqui, por defesa.
 */
export async function listarDaConta(db: Db): Promise<GruposDaConta> {
  const linhas = await db
    .selectFrom('grupos as g')
    .innerJoin('vinculos_admin as v', (j) =>
      j.onRef('v.grupo_id', '=', 'g.id').on('v.conta_id', '=', sql<string>`app_conta_id()`),
    )
    .select(['g.id', 'g.nome', 'g.slug', 'g.dia_semana', 'g.frequencia', 'g.horario', 'g.arquivado_em', 'g.criado_por'])
    .select(sql<boolean>`g.criado_por = app_conta_id()`.as('sou_criador'))
    .orderBy('g.nome')
    .orderBy('g.id')
    .execute();
  const item = (g: (typeof linhas)[number]): GrupoItem => ({
    id: g.id,
    nome: g.nome,
    slug: g.slug,
    diaSemana: g.dia_semana,
    frequencia: g.frequencia,
    horario: horaMinuto(g.horario),
  });
  return {
    ativos: linhas.filter((g) => g.arquivado_em === null).map(item),
    arquivados: linhas.filter((g) => g.arquivado_em !== null && g.sou_criador).map(item),
  };
}

/**
 * O grupo visível à conta da requisição, com as contagens da tela (GEL-20): jogadores ativos (com período aberto,
 * GEL-50), habilidades e admins; e se a conta é a criadora. Sem linha (sem vínculo, ou arquivado de outra criadora),
 * nulo.
 */
export async function ler(db: Db, grupoId: string): Promise<GrupoLido | null> {
  const g = await db
    .selectFrom('grupos as g')
    .select(['g.id', 'g.nome', 'g.slug', 'g.dia_semana', 'g.frequencia', 'g.horario', 'g.arquivado_em'])
    .select(sql<boolean>`g.criado_por = app_conta_id()`.as('sou_criador'))
    .select((eb) => [
      eb
        .selectFrom('jogadores as j')
        .innerJoin('periodos_ativos as p', (jn) => jn.onRef('p.jogador_id', '=', 'j.id').on('p.fim', 'is', null))
        .select(eb.fn.countAll<string>().as('n'))
        .whereRef('j.grupo_id', '=', 'g.id')
        .as('jogadores_ativos'),
      eb
        .selectFrom('habilidades as h')
        .select(eb.fn.countAll<string>().as('n'))
        .whereRef('h.grupo_id', '=', 'g.id')
        .as('habilidades'),
      eb
        .selectFrom('vinculos_admin as v')
        .select(eb.fn.countAll<string>().as('n'))
        .whereRef('v.grupo_id', '=', 'g.id')
        .as('admins'),
    ])
    .where('g.id', '=', grupoId)
    .executeTakeFirst();
  if (!g) return null;
  return {
    id: g.id,
    nome: g.nome,
    slug: g.slug,
    diaSemana: g.dia_semana,
    frequencia: g.frequencia,
    horario: horaMinuto(g.horario),
    arquivado: g.arquivado_em !== null,
    jogadoresAtivos: Number(g.jogadores_ativos ?? 0),
    habilidades: Number(g.habilidades ?? 0),
    admins: Number(g.admins ?? 0),
    souCriador: g.sou_criador,
  };
}
