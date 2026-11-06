import { sql } from 'kysely';
import type { EditarJogadorCorpo } from '@pelada/contrato';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Editar e excluir o jogador (T35; GEL-41 a GEL-45, GEL-84, GEL-85, SEC-008). Interface de `GD:151`. Não escreve
 * `periodos_ativos` nem `inicio_pontuacao` (GEL-83, GEL-111): a data de entrada só muda pela rota de início (T41), e o
 * corpo da edição nem a aceita (`editarJogadorCorpo`). Toda consulta filtra por `grupo_id`, além da RLS (GEL-44).
 *
 * Auditoria (GEL-42, SEC-008, GEL-113): `jogador_editado` com só os nomes dos campos alterados, sem os valores (o
 * telefone e o ano são dado pessoal); `jogador_pontuacao_inicial_alterada` com o valor antigo e o novo (dado de
 * negócio, sem dado pessoal). Edição sem mudança não grava nem audita.
 *
 * Histórico (GEL-85, `GS:52`, C8 de `context.md:14`): presença em partida, nota ou pagamento. Com qualquer um, o
 * jogador não é apagado (a sugestão é inativar); sem nenhum, o jogador e os períodos saem juntos (cascade) e há
 * `jogador_excluido`. A linha do jogador fica travada (`FOR UPDATE`) da conferência até o DELETE.
 */

export type ResultadoEditarJogador =
  { resultado: 'ok'; mudou: boolean } | { resultado: 'nao_encontrado' | 'apelido_repetido' };

export type ResultadoExcluirJogador =
  | { resultado: 'ok' }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'com_historico'; apelido: string };

interface Atual {
  apelido: string;
  anoNascimento: number | null;
  posicao: string | null;
  telefone: string | null;
  pontuacaoInicial: number;
}

const CAMPOS = ['apelido', 'anoNascimento', 'posicao', 'telefone', 'pontuacaoInicial'] as const;

async function editar(
  db: Db,
  grupoId: string,
  id: string,
  dados: EditarJogadorCorpo,
): Promise<ResultadoEditarJogador> {
  const r = await sql<Atual>`
    SELECT apelido, ano_nascimento AS "anoNascimento", posicao, telefone, pontuacao_inicial AS "pontuacaoInicial"
      FROM jogadores WHERE grupo_id = ${grupoId} AND id = ${id}
       FOR UPDATE`.execute(db);
  const atual = r.rows[0];
  if (!atual) return { resultado: 'nao_encontrado' };

  const repetido = await sql<{ id: string }>`
    SELECT id FROM jogadores
     WHERE grupo_id = ${grupoId} AND id <> ${id} AND lower(apelido) = lower(${dados.apelido})`.execute(
    db,
  );
  if (repetido.rows.length > 0) return { resultado: 'apelido_repetido' };

  // Pontuação omitida mantém o valor (GEL-43).
  const novo: Atual = {
    apelido: dados.apelido,
    anoNascimento: dados.anoNascimento,
    posicao: dados.posicao,
    telefone: dados.telefone ?? null,
    pontuacaoInicial: dados.pontuacaoInicial ?? Number(atual.pontuacaoInicial),
  };
  const campos = CAMPOS.filter((campo) => {
    const antes =
      campo === 'pontuacaoInicial' || campo === 'anoNascimento'
        ? numeroOuNulo(atual[campo])
        : atual[campo];
    return antes !== novo[campo];
  });
  if (campos.length === 0) return { resultado: 'ok', mudou: false };

  await sql`
    UPDATE jogadores
       SET apelido = ${novo.apelido}, ano_nascimento = ${novo.anoNascimento}, posicao = ${novo.posicao},
           telefone = ${novo.telefone}, pontuacao_inicial = ${novo.pontuacaoInicial},
           alterado_por = app_conta_id(), alterado_em = now()
     WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);

  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_editado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { campos },
  });
  if (campos.includes('pontuacaoInicial')) {
    await auditoria.registrar(db, grupoId, {
      acao: 'jogador_pontuacao_inicial_alterada',
      entidade: 'jogador',
      entidadeId: id,
      resumo: { antes: Number(atual.pontuacaoInicial), depois: novo.pontuacaoInicial },
    });
  }
  return { resultado: 'ok', mudou: true };
}

function numeroOuNulo(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

async function excluir(db: Db, grupoId: string, id: string): Promise<ResultadoExcluirJogador> {
  const r = await sql<{ apelido: string; historico: boolean }>`
    SELECT j.apelido,
           (EXISTS (SELECT 1 FROM presencas p WHERE p.jogador_id = j.id AND p.grupo_id = j.grupo_id)
            OR EXISTS (SELECT 1 FROM notas n WHERE n.jogador_id = j.id AND n.grupo_id = j.grupo_id)
            OR EXISTS (SELECT 1 FROM pagamentos_mes m WHERE m.jogador_id = j.id AND m.grupo_id = j.grupo_id)) AS historico
      FROM jogadores j WHERE j.grupo_id = ${grupoId} AND j.id = ${id}
       FOR UPDATE OF j`.execute(db);
  const jogador = r.rows[0];
  if (!jogador) return { resultado: 'nao_encontrado' };
  if (jogador.historico) return { resultado: 'com_historico', apelido: jogador.apelido };

  try {
    await sql`DELETE FROM jogadores WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  } catch (erro) {
    // A policy restritiva do financeiro esconde `pagamentos_mes` de quem não acessa o financeiro: o EXISTS acima não
    // o vê e a FK recusa o DELETE (23503). Mesma resposta de quem vê o histórico, sem revelar o pagamento (SV-02).
    if ((erro as { code?: unknown }).code === '23503') {
      return { resultado: 'com_historico', apelido: jogador.apelido };
    }
    throw erro;
  }
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_excluido',
    entidade: 'jogador',
    entidadeId: id,
  });
  return { resultado: 'ok' };
}

export const jogadoresEdicao = { editar, excluir };
