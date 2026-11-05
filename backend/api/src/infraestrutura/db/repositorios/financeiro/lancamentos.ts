import { sql } from 'kysely';
import type { LancamentoCorpo, TipoLancamento } from '@pelada/contrato';
import { auditoria } from '../convites.ts';
import type { Db } from '../tipos.ts';

/**
 * Lançamentos do caixa: criar, ler e editar (financeiro T20; FIN-25, FIN-27, FIN-28, FIN-31, FIN-32). Valores em
 * centavos inteiros; datas como texto `AAAA-MM-DD`. Toda consulta filtra por `grupo_id`, além da RLS: o lançamento de
 * outro grupo e o id inexistente dão o mesmo "não encontrado" (FIN-31).
 *
 * - `criar`: lançamento avulso (`mensalidade` falso), autora e momento de `app_conta_id()` e `now()`, e
 *   `lancamento_criado` com tipo, data e valor, sem a descrição (FIN-44).
 * - `ler`: o lançamento com `mensalidade`, o vínculo (jogador, apelido e mês do pagamento) e o nome de quem alterou,
 *   lido por `contas_nomes_do_grupo` (estendida na T10); conta que a função não devolve sai como "Conta excluída"
 *   (FIN-32, ACE-28).
 * - `editar`: `SELECT … FOR UPDATE`, grava tipo, data, descrição e valor, atualiza quem alterou e quando e audita
 *   `lancamento_editado` com o valor antes e depois. A entrada de mensalidade continua vinculada ao pagamento (o
 *   vínculo mora em `pagamentos_mes`, que a edição não toca), e virar saída é recusado (`mensalidade_nao_e_saida`,
 *   FIN-28) sem gravar.
 */

export const CONTA_EXCLUIDA = 'Conta excluída';

export interface VinculoDoLancamento {
  jogadorId: string;
  apelido: string;
  /** `AAAA-MM`. */
  mes: string;
}

export interface LancamentoLido {
  id: string;
  tipo: TipoLancamento;
  data: string;
  descricao: string;
  valorCentavos: number;
  mensalidade: boolean;
  /** O pagamento a que a entrada pertence; nulo no lançamento avulso. */
  vinculo: VinculoDoLancamento | null;
  alteradoPor: string;
  /** ISO 8601 com deslocamento. */
  alteradoEm: string;
}

interface Linha {
  id: string;
  tipo: TipoLancamento;
  data: string;
  descricao: string;
  valor_centavos: number;
  alterado_por: string;
  alterado_em: Date;
  jogador_id: string | null;
  apelido: string | null;
  mes: string | null;
}

async function ler(db: Db, grupoId: string, id: string): Promise<LancamentoLido | null> {
  const r = await sql<Linha>`
    SELECT l.id, l.tipo, l.data::text AS data, l.descricao, l.valor_centavos, l.alterado_por, l.alterado_em,
           p.jogador_id, j.apelido, p.mes
      FROM lancamentos l
      LEFT JOIN pagamentos_mes p ON p.lancamento_id = l.id AND p.grupo_id = l.grupo_id
      LEFT JOIN jogadores j ON j.id = p.jogador_id AND j.grupo_id = l.grupo_id
     WHERE l.grupo_id = ${grupoId} AND l.id = ${id}`.execute(db);
  const l = r.rows[0];
  if (!l) return null;
  const nomes = await sql<{
    id: string;
    nome: string;
  }>`SELECT id, nome FROM contas_nomes_do_grupo(${grupoId})`.execute(db);
  const nome = nomes.rows.find((n) => n.id === l.alterado_por)?.nome ?? CONTA_EXCLUIDA;
  const vinculado = l.jogador_id !== null && l.apelido !== null && l.mes !== null;
  return {
    id: l.id,
    tipo: l.tipo,
    data: l.data,
    descricao: l.descricao,
    valorCentavos: Number(l.valor_centavos),
    mensalidade: vinculado,
    vinculo: vinculado
      ? { jogadorId: l.jogador_id as string, apelido: l.apelido as string, mes: l.mes as string }
      : null,
    alteradoPor: nome,
    alteradoEm: new Date(l.alterado_em).toISOString(),
  };
}

async function criar(db: Db, grupoId: string, dados: LancamentoCorpo): Promise<LancamentoLido> {
  const r = await sql<{ id: string }>`
    INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
    VALUES (${grupoId}, ${dados.tipo}, ${dados.data}::date, ${dados.descricao}, ${dados.valorCentavos},
            app_conta_id(), now(), app_conta_id(), now())
    RETURNING id`.execute(db);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('INSERT de lançamento sem id');
  await auditoria.registrar(db, grupoId, {
    acao: 'lancamento_criado',
    entidade: 'lancamento',
    entidadeId: id,
    resumo: { tipo: dados.tipo, data: dados.data, valorCentavos: dados.valorCentavos },
  });
  const criado = await ler(db, grupoId, id);
  if (!criado) throw new Error('Lançamento criado e não encontrado');
  return criado;
}

export type ResultadoEditarLancamento =
  | { resultado: 'ok'; lancamento: LancamentoLido }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'mensalidade_nao_e_saida' };

async function editar(
  db: Db,
  grupoId: string,
  id: string,
  dados: LancamentoCorpo,
): Promise<ResultadoEditarLancamento> {
  const atual = await sql<{ valor_centavos: number; vinculado: boolean }>`
    SELECT l.valor_centavos,
           EXISTS (SELECT 1 FROM pagamentos_mes p WHERE p.lancamento_id = l.id AND p.grupo_id = l.grupo_id) AS vinculado
      FROM lancamentos l
     WHERE l.grupo_id = ${grupoId} AND l.id = ${id}
       FOR UPDATE OF l`.execute(db);
  const antes = atual.rows[0];
  if (!antes) return { resultado: 'nao_encontrado' };
  if (antes.vinculado && dados.tipo === 'saida') return { resultado: 'mensalidade_nao_e_saida' };

  await sql`
    UPDATE lancamentos
       SET tipo = ${dados.tipo}, data = ${dados.data}::date, descricao = ${dados.descricao},
           valor_centavos = ${dados.valorCentavos}, alterado_por = app_conta_id(), alterado_em = now()
     WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'lancamento_editado',
    entidade: 'lancamento',
    entidadeId: id,
    resumo: {
      antes: { valorCentavos: Number(antes.valor_centavos) },
      depois: { valorCentavos: dados.valorCentavos },
    },
  });
  const editado = await ler(db, grupoId, id);
  if (!editado) throw new Error('Lançamento editado e não encontrado');
  return { resultado: 'ok', lancamento: editado };
}

export const lancamentos = { criar, ler, editar };
