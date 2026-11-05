import { sql } from 'kysely';
import type { DadosGrupo, DiaSemana, Frequencia } from '@pelada/contrato';
import { dataSugeridaPartida, ehPesosPadrao, HABILIDADES_INICIAIS, mesDe, slugBase } from '@pelada/dominio';
import { eventos } from './eventos.ts';
import type { Db } from './tipos.ts';

/**
 * Repositório de grupos: criar, listar e ler (T26; GEL-01, GEL-02, GEL-14, GEL-20, GEL-27). Interfaces de `GD:150`;
 * as escritas de estado (editar, arquivar, reativar) ficam em `grupos-estado.ts` (T27). Recebe o `Db` da transação da
 * requisição, sob a RLS: `grupos` só mostra os de `grupos_visiveis()` (arquivado só para a criadora).
 *
 * `horario` é `time` no banco; aqui sai como `HH:MM` (`to_char`), o formato do contrato.
 */

export interface GrupoCriado {
  id: string;
  slug: string;
}

/**
 * `grupo_criar` de 7 parâmetros (`1792844640000_grupo-criar-pesos.sql`, T22 da partidas-e-ranking): grupo com
 * `criado_por` = conta da sessão, vínculo com financeiro, as 6 habilidades iniciais na ordem do GEL-02, os pesos padrão
 * vigentes desde `hoje` (PAR-15) e a auditoria `grupo_criado`, num comando só. `hoje` vem do relógio da requisição
 * (AD-015). A base do slug é do domínio (GEL-11 a GEL-13); o sufixo livre (`-2`, `-3`..., contando os arquivados,
 * GEL-14) e as 3 tentativas na corrida (GEL-15) são da função.
 */
async function criar(db: Db, dados: DadosGrupo, hoje: string): Promise<GrupoCriado> {
  const r = await sql<GrupoCriado>`
    SELECT id, slug FROM grupo_criar(${dados.nome}, ${dados.diaSemana}, ${dados.frequencia}, ${dados.horario}::time,
                                     ${slugBase(dados.nome)}, ${[...HABILIDADES_INICIAIS]}::text[], ${hoje}::date)`.execute(
    db,
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('grupo_criar sem resultado');
  return { id: linha.id, slug: linha.slug };
}

export interface ItemGrupo {
  id: string;
  nome: string;
  slug: string;
  diaSemana: DiaSemana;
  frequencia: Frequencia;
  horario: string;
}

export interface GruposDaConta {
  ativos: ItemGrupo[];
  /** Só os arquivados que a própria conta criou (GEL-25, GEL-27). */
  arquivados: ItemGrupo[];
}

/**
 * Os grupos em que a conta da sessão é admin: os ativos e, à parte, os arquivados que ela criou. O filtro de
 * `criado_por` repete o da RLS (que já esconde o arquivado de quem não criou), para a lista não depender só dela.
 * Ordem por nome e id, como a sessão (`contas.eu`).
 */
async function listarDaConta(db: Db): Promise<GruposDaConta> {
  const r = await sql<ItemGrupo & { arquivado: boolean }>`
    SELECT g.id, g.nome, g.slug, g.dia_semana AS "diaSemana", g.frequencia, to_char(g.horario, 'HH24:MI') AS horario,
           g.arquivado_em IS NOT NULL AS arquivado
      FROM grupos g
      JOIN vinculos_admin v ON v.grupo_id = g.id AND v.conta_id = app_conta_id()
     WHERE g.arquivado_em IS NULL OR g.criado_por = app_conta_id()
     ORDER BY g.nome, g.id`.execute(db);
  const item = ({ arquivado: _arquivado, ...g }: ItemGrupo & { arquivado: boolean }): ItemGrupo => g;
  return {
    ativos: r.rows.filter((g) => !g.arquivado).map(item),
    arquivados: r.rows.filter((g) => g.arquivado).map(item),
  };
}

export interface DetalheGrupo extends ItemGrupo {
  /** Jogadores com período aberto (GEL-50). */
  jogadoresAtivos: number;
  habilidades: number;
  admins: number;
  /** A conta da sessão criou o grupo: só ela arquiva e reativa (GEL-24). */
  souCriador: boolean;
  arquivado: boolean;
}

/** Os dados do início do grupo (PAR-132; `BC:26`, P14; `BD:212-213`), calculados para `hoje`. */
export interface DadosDoInicio {
  dataSugeridaPartida: string;
  partidaNaDataSugerida: boolean;
  /** Partidas no mês de hoje. */
  partidasNoMes: number;
  /** `vigente_desde` da configuração de pesos vigente hoje. */
  pesosVigentesDesde: string;
  /** Uma só configuração, com os valores padrão (P10, PAR-135). */
  pesosPadrao: boolean;
  /** Aparelhos distintos com `ranking_aberto` na semana de hoje. */
  aparelhosNaSemana: number;
}

export type DetalheGrupoComInicio = DetalheGrupo & DadosDoInicio;

/**
 * O grupo com as contagens e `souCriador` (GEL-20). Nulo quando a RLS não mostra o grupo (sem vínculo, ou arquivado
 * de outra criadora): a rota responde 404 (GEL-21, GEL-25). As contagens filtram por `grupo_id`, além da RLS.
 *
 * Com `hoje` (T34 da partidas-e-ranking), acrescenta os dados do início do grupo (PAR-132).
 * SPEC_DEVIATION: a T34 diz `grupos.ler(db, grupoId, hoje)`; aqui `hoje` é opcional, porque o PATCH e o arquivar do
 * grupo (`grupo-estado.ts`) respondem o `grupoDetalhe` estrito, sem esses campos; só o GET do grupo (T43) os pede.
 */
async function ler(db: Db, grupoId: string): Promise<DetalheGrupo | null>;
async function ler(db: Db, grupoId: string, hoje: string): Promise<DetalheGrupoComInicio | null>;
async function ler(db: Db, grupoId: string, hoje?: string): Promise<DetalheGrupo | DetalheGrupoComInicio | null> {
  const base = await lerBase(db, grupoId);
  if (!base || hoje === undefined) return base;
  return { ...base, ...(await dadosDoInicio(db, grupoId, base.diaSemana, hoje)) };
}

interface LinhaPesosInicio {
  vigente_desde: string;
  presenca_sem_chuva: number;
  presenca_com_chuva: number;
  lesionado_sem_chuva: number;
  lesionado_com_chuva: number;
  expulso: number;
  expulso_com_chuva: number;
}

/**
 * Casos limite: o dia de jogo é hoje (a sugerida é hoje); mês de hoje sem partida (0); uma configuração com os
 * valores padrão (`pesosPadrao`) ou duas, mesmo iguais ao padrão (não é padrão, PAR-135); configuração com vigência
 * depois de hoje não conta como vigente. Todo grupo tem configuração (T21, T22): sem nenhuma até hoje, é erro.
 */
async function dadosDoInicio(db: Db, grupoId: string, dia: DiaSemana, hoje: string): Promise<DadosDoInicio> {
  const sugerida = dataSugeridaPartida(hoje, dia);
  const mes = mesDe(hoje);
  const p = await sql<{ no_mes: number; na_sugerida: boolean }>`
    SELECT count(*) FILTER (WHERE data >= (${mes} || '-01')::date
                              AND data < (${mes} || '-01')::date + interval '1 month')::int AS no_mes,
           coalesce(bool_or(data = ${sugerida}::date), false) AS na_sugerida
      FROM partidas WHERE grupo_id = ${grupoId}`.execute(db);
  const configs = await sql<LinhaPesosInicio>`
    SELECT vigente_desde::text AS vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
           lesionado_com_chuva, expulso, expulso_com_chuva
      FROM config_pesos WHERE grupo_id = ${grupoId}
     ORDER BY vigente_desde`.execute(db);
  const vigente = configs.rows.filter((c) => c.vigente_desde <= hoje).at(-1);
  if (!vigente) throw new Error('Grupo sem configuração de pesos vigente');
  const comoDominio = configs.rows.map((c) => ({
    vigenteDesde: c.vigente_desde,
    presencaSemChuva: c.presenca_sem_chuva,
    presencaComChuva: c.presenca_com_chuva,
    lesionadoSemChuva: c.lesionado_sem_chuva,
    lesionadoComChuva: c.lesionado_com_chuva,
    expulsoSemChuva: c.expulso,
    expulsoComChuva: c.expulso_com_chuva,
  }));
  return {
    dataSugeridaPartida: sugerida,
    partidaNaDataSugerida: p.rows[0]?.na_sugerida === true,
    partidasNoMes: p.rows[0]?.no_mes ?? 0,
    pesosVigentesDesde: vigente.vigente_desde,
    pesosPadrao: ehPesosPadrao(comoDominio),
    aparelhosNaSemana: await eventos.aparelhosDaSemana(db, grupoId, hoje),
  };
}

async function lerBase(db: Db, grupoId: string): Promise<DetalheGrupo | null> {
  const r = await sql<Omit<DetalheGrupo, 'jogadoresAtivos' | 'habilidades' | 'admins'> & {
    jogadoresAtivos: string;
    habilidades: string;
    admins: string;
  }>`
    SELECT g.id, g.nome, g.slug, g.dia_semana AS "diaSemana", g.frequencia, to_char(g.horario, 'HH24:MI') AS horario,
           g.criado_por = app_conta_id() AS "souCriador",
           g.arquivado_em IS NOT NULL AS arquivado,
           (SELECT count(DISTINCT p.jogador_id) FROM periodos_ativos p
             WHERE p.grupo_id = g.id AND p.fim IS NULL) AS "jogadoresAtivos",
           (SELECT count(*) FROM habilidades h WHERE h.grupo_id = g.id) AS habilidades,
           (SELECT count(*) FROM vinculos_admin v WHERE v.grupo_id = g.id) AS admins
      FROM grupos g
     WHERE g.id = ${grupoId}`.execute(db);
  const linha = r.rows[0];
  if (!linha) return null;
  return {
    ...linha,
    souCriador: linha.souCriador === true,
    jogadoresAtivos: Number(linha.jogadoresAtivos),
    habilidades: Number(linha.habilidades),
    admins: Number(linha.admins),
  };
}

export const grupos = { criar, listarDaConta, ler };
