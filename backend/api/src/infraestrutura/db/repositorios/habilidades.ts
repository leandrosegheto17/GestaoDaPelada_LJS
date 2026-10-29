import { sql } from 'kysely';
import type { Db } from '../index.ts';
import * as auditoria from './auditoria.ts';
import type { Recusa } from './jogadores.ts';

// Habilidades do grupo (grupos-e-elenco, design C5; GEL-88 a GEL-96). Todo acesso filtra por `grupo_id` e roda sob a
// RLS da conta da requisição. A ordem é a de cadastro (coluna identity `ordem` da linha de base).

export interface HabilidadeLida {
  id: string;
  nome: string;
}

const MENSAGEM_NOME_REPETIDO = 'Já existe uma habilidade com esse nome.';

const nomeRepetido: Recusa<'nome'> = { ok: false, campo: 'nome', mensagem: MENSAGEM_NOME_REPETIDO };

/** Erro do pg com o código SQLSTATE e o nome da constraint (índice único `habilidades_nome_grupo`). */
const violouNome = (erro: unknown): boolean => {
  const e = erro as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === 'habilidades_nome_grupo';
};

/** Outra habilidade do grupo com o mesmo nome, ignorando a caixa (GEL-91, mesmo critério do índice único). */
async function nomeEmUso(db: Db, grupoId: string, nome: string, exceto?: string): Promise<boolean> {
  let consulta = db
    .selectFrom('habilidades')
    .select('id')
    .where('grupo_id', '=', grupoId)
    .where(sql<string>`lower(nome)`, '=', sql<string>`lower(${nome})`);
  if (exceto) consulta = consulta.where('id', '<>', exceto);
  return (await consulta.executeTakeFirst()) !== undefined;
}

/** As habilidades do grupo, na ordem de cadastro (GEL-88). */
export async function listar(db: Db, grupoId: string): Promise<HabilidadeLida[]> {
  return db.selectFrom('habilidades').select(['id', 'nome']).where('grupo_id', '=', grupoId).orderBy('ordem').execute();
}

/** Uma habilidade do grupo; de outro grupo (ou inexistente), nula (GEL-96). */
export async function ler(db: Db, grupoId: string, habilidadeId: string): Promise<HabilidadeLida | null> {
  const linha = await db
    .selectFrom('habilidades')
    .select(['id', 'nome'])
    .where('grupo_id', '=', grupoId)
    .where('id', '=', habilidadeId)
    .executeTakeFirst();
  return linha ?? null;
}

/**
 * Cria a habilidade no fim da ordem (GEL-89). Nome repetido sem caixa é recusado pela consulta e, na corrida que
 * passar dela, pelo índice único (23505), com a mesma recusa (GEL-91).
 */
export async function criar(db: Db, grupoId: string, nome: string): Promise<{ ok: true; id: string } | Recusa<'nome'>> {
  if (await nomeEmUso(db, grupoId, nome)) return nomeRepetido;
  try {
    const linha = await db
      .insertInto('habilidades')
      .values({ grupo_id: grupoId, nome })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { ok: true, id: linha.id };
  } catch (erro) {
    if (violouNome(erro)) return nomeRepetido;
    throw erro;
  }
}

/**
 * Renomeia a habilidade (GEL-92): só o nome muda; as notas e a posição na ordem continuam. A própria habilidade não
 * conta como repetida (trocar só a caixa é aceito). De outro grupo: nulo (GEL-96).
 */
export async function renomear(
  db: Db,
  grupoId: string,
  habilidadeId: string,
  nome: string,
): Promise<{ ok: true } | Recusa<'nome'> | null> {
  if (!(await ler(db, grupoId, habilidadeId))) return null;
  if (await nomeEmUso(db, grupoId, nome, habilidadeId)) return nomeRepetido;
  try {
    await db
      .updateTable('habilidades')
      .set({ nome })
      .where('grupo_id', '=', grupoId)
      .where('id', '=', habilidadeId)
      .execute();
  } catch (erro) {
    if (violouNome(erro)) return nomeRepetido;
    throw erro;
  }
  return { ok: true };
}

/**
 * Exclui a habilidade (GEL-93): as notas de todos os jogadores nela saem pela chave com cascade, e a auditoria
 * `habilidade_excluida` guarda só o id e a quantidade de notas apagadas (GEL-113). De outro grupo: nulo (GEL-96).
 */
export async function excluir(db: Db, grupoId: string, habilidadeId: string): Promise<{ ok: true } | null> {
  const notas = await db
    .selectFrom('notas')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('grupo_id', '=', grupoId)
    .where('habilidade_id', '=', habilidadeId)
    .executeTakeFirstOrThrow();
  const r = await db
    .deleteFrom('habilidades')
    .where('grupo_id', '=', grupoId)
    .where('id', '=', habilidadeId)
    .executeTakeFirst();
  if (Number(r.numDeletedRows) === 0) return null;
  await auditoria.registrar(db, grupoId, 'habilidade_excluida', 'habilidade', habilidadeId, {
    notasApagadas: Number(notas.n),
  });
  return { ok: true };
}
