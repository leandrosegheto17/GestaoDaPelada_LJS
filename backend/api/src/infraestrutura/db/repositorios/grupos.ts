import { sql } from 'kysely';
import type { DadosGrupo, DiaSemana, Frequencia } from '@pelada/contrato';
import { HABILIDADES_INICIAIS, slugBase } from '@pelada/dominio';
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
 * `grupo_criar` (`1792844340000_grupo-criar.sql:10`): grupo com `criado_por` = conta da sessão, vínculo com financeiro,
 * as 6 habilidades iniciais na ordem do GEL-02 e a auditoria `grupo_criado`, num comando só. A base do slug é do
 * domínio (GEL-11 a GEL-13); o sufixo livre (`-2`, `-3`..., contando os arquivados, GEL-14) e as 3 tentativas na
 * corrida (GEL-15) são da função.
 */
async function criar(db: Db, dados: DadosGrupo): Promise<GrupoCriado> {
  const r = await sql<GrupoCriado>`
    SELECT id, slug FROM grupo_criar(${dados.nome}, ${dados.diaSemana}, ${dados.frequencia}, ${dados.horario}::time,
                                     ${slugBase(dados.nome)}, ${[...HABILIDADES_INICIAIS]}::text[])`.execute(db);
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

/**
 * O grupo com as contagens e `souCriador` (GEL-20). Nulo quando a RLS não mostra o grupo (sem vínculo, ou arquivado
 * de outra criadora): a rota responde 404 (GEL-21, GEL-25). As contagens filtram por `grupo_id`, além da RLS.
 */
async function ler(db: Db, grupoId: string): Promise<DetalheGrupo | null> {
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
