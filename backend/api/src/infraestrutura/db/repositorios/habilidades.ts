import { sql } from 'kysely';
import type { HabilidadeCorpo, HabilidadeItem } from '@pelada/contrato';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Habilidades do grupo (T46; GEL-88 a GEL-93, GEL-96, SEC-008). Interface de `GD:153`; o `Db` é o da transação da
 * requisição e toda consulta filtra por `grupo_id`, além da RLS (GEL-96).
 *
 * - A ordem é a coluna `ordem` (identity): a criada vai para o fim (GEL-89) e renomear não a muda (GEL-92).
 * - Nome repetido sem caixa (GEL-91): consulta antes de gravar; a corrida que passar cai no índice
 *   `habilidades_nome_grupo` (`grupo_id, lower(nome)`), e o 23505 sobe para a rota traduzir (`comUnicidade`, T20).
 * - Excluir apaga as notas da habilidade pela FK com cascade (GEL-93).
 * - Auditoria só com ids (GEL-113, SEC-008, `GSEG:164`): `habilidade_criada`, `habilidade_renomeada` (com `campos`)
 *   e `habilidade_excluida`. Renomear para o mesmo nome não grava nem audita.
 */

export type ResultadoHabilidade =
  | { resultado: 'ok'; habilidade: HabilidadeItem }
  | { resultado: 'nao_encontrada' | 'nome_repetido' };

async function listar(db: Db, grupoId: string): Promise<HabilidadeItem[]> {
  const r = await sql<HabilidadeItem>`
    SELECT id, nome FROM habilidades WHERE grupo_id = ${grupoId} ORDER BY ordem, id`.execute(db);
  return r.rows;
}

async function nomeRepetido(db: Db, grupoId: string, nome: string, exceto: string | null): Promise<boolean> {
  const r = await sql<{ id: string }>`
    SELECT id FROM habilidades
     WHERE grupo_id = ${grupoId} AND lower(nome) = lower(${nome})
       AND (${exceto}::uuid IS NULL OR id <> ${exceto}::uuid)`.execute(db);
  return r.rows.length > 0;
}

async function criar(db: Db, grupoId: string, dados: HabilidadeCorpo): Promise<ResultadoHabilidade> {
  if (await nomeRepetido(db, grupoId, dados.nome, null)) return { resultado: 'nome_repetido' };
  const r = await sql<HabilidadeItem>`
    INSERT INTO habilidades (grupo_id, nome) VALUES (${grupoId}, ${dados.nome})
    RETURNING id, nome`.execute(db);
  const habilidade = r.rows[0];
  if (!habilidade) throw new Error('INSERT de habilidade sem id');
  await auditoria.registrar(db, grupoId, { acao: 'habilidade_criada', entidade: 'habilidade', entidadeId: habilidade.id });
  return { resultado: 'ok', habilidade };
}

async function renomear(db: Db, grupoId: string, id: string, dados: HabilidadeCorpo): Promise<ResultadoHabilidade> {
  const atual = await sql<HabilidadeItem>`
    SELECT id, nome FROM habilidades WHERE grupo_id = ${grupoId} AND id = ${id} FOR UPDATE`.execute(db);
  const linha = atual.rows[0];
  if (!linha) return { resultado: 'nao_encontrada' };
  if (linha.nome === dados.nome) return { resultado: 'ok', habilidade: linha };
  if (await nomeRepetido(db, grupoId, dados.nome, id)) return { resultado: 'nome_repetido' };

  await sql`UPDATE habilidades SET nome = ${dados.nome} WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'habilidade_renomeada',
    entidade: 'habilidade',
    entidadeId: id,
    resumo: { campos: ['nome'] },
  });
  return { resultado: 'ok', habilidade: { id, nome: dados.nome } };
}

async function excluir(db: Db, grupoId: string, id: string): Promise<{ resultado: 'ok' | 'nao_encontrada' }> {
  const r = await sql<{ id: string }>`
    DELETE FROM habilidades WHERE grupo_id = ${grupoId} AND id = ${id} RETURNING id`.execute(db);
  if (r.rows.length === 0) return { resultado: 'nao_encontrada' };
  await auditoria.registrar(db, grupoId, { acao: 'habilidade_excluida', entidade: 'habilidade', entidadeId: id });
  return { resultado: 'ok' };
}

export const habilidades = { listar, criar, renomear, excluir };
