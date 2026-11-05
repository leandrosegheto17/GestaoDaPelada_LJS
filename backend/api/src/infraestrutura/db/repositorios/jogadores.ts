import { sql } from 'kysely';
import type { JogadorCorpo } from '@pelada/contrato';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Escritas do jogador que tocam `periodos_ativos` e `inicio_pontuacao` (GEL-83, GEL-109, GEL-111): só este arquivo as
 * faz (a checagem da T45 reprova escrita delas fora daqui e das migrações). Interface de `GD:151-152`; o `Db` é o da
 * transação da requisição. A criação (T34) abre o primeiro período; inativar, reativar, corrigir e alterar o início
 * vêm nas T38 a T41.
 */

export type ResultadoCriarJogador = { resultado: 'ok'; id: string } | { resultado: 'apelido_repetido' };

/**
 * Cadastra o jogador (GEL-31): confere o apelido repetido sem caixa (GEL-35; o acento conta, como o índice
 * `jogadores_apelido_grupo` em `lower(apelido)`), grava `inicio_pontuacao` = data de entrada (hoje, sem ela, GEL-32),
 * abre o primeiro período nessa data e audita `jogador_criado` só com o id e a data (GEL-45, GEL-113: sem telefone nem
 * ano). Telefone ausente ou vazio já chega nulo do contrato (GEL-38).
 *
 * A corrida de dois cadastros do mesmo apelido passa pela consulta e cai no índice único: o 23505 sobe e a rota o
 * traduz no mesmo 422 (`comUnicidade`, T20), não 500.
 */
async function criar(db: Db, grupoId: string, dados: JogadorCorpo, hoje: string): Promise<ResultadoCriarJogador> {
  const repetido = await sql<{ id: string }>`
    SELECT id FROM jogadores WHERE grupo_id = ${grupoId} AND lower(apelido) = lower(${dados.apelido})`.execute(db);
  if (repetido.rows.length > 0) return { resultado: 'apelido_repetido' };

  const entrada = dados.dataEntrada ?? hoje;
  const r = await sql<{ id: string }>`
    INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, inicio_pontuacao,
                           criado_por, criado_em, alterado_por, alterado_em)
    VALUES (${grupoId}, ${dados.apelido}, ${dados.anoNascimento}, ${dados.posicao}, ${dados.telefone ?? null},
            ${dados.pontuacaoInicial}, ${entrada}::date, app_conta_id(), now(), app_conta_id(), now())
    RETURNING id`.execute(db);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('INSERT de jogador sem id');

  await sql`
    INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim)
    VALUES (${id}, ${grupoId}, ${entrada}::date, NULL)`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_criado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { dataEntrada: entrada },
  });
  return { resultado: 'ok', id };
}

export const jogadores = { criar };
