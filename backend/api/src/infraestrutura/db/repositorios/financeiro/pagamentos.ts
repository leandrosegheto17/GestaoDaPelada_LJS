import { sql } from 'kysely';
import { ativoNoMes, entradaDaMensalidade } from '@pelada/dominio';
import { auditoria } from '../convites.ts';
import { jogadores } from '../jogadores.ts';
import type { Db } from '../tipos.ts';
import { configFinanceira } from './config.ts';

/**
 * Marcar o pagamento da mensalidade (financeiro T18; FIN-16, FIN-17, FIN-19, FIN-20, FIN-21; AD-038, AD-078). Tudo
 * numa transação, a da requisição: trava o jogador (`jogadores.travarVarios`, o mesmo bloqueio dos escritores de
 * período, AD-038), confere que ele é do grupo e ativo no mês (FIN-19), lê a configuração, cria o lançamento de entrada quando
 * há mensalidade (FIN-16; só o pagamento quando não há, FIN-17), cria o pagamento vinculado e audita
 * `pagamento_marcado` com o mês e o valor, sem apelido nem descrição (FIN-44).
 *
 * Marcar o mesmo jogador e mês de novo, inclusive em corrida (FIN-20): a trava do jogador serializa as duas, e a
 * segunda encontra o pagamento e devolve `ja_marcado`. A PK `(jogador_id, mes)` é a segunda barreira: se o `INSERT`
 * ainda assim der 23505, um `SAVEPOINT` desfaz o lançamento recém-criado e o resultado é o mesmo `ja_marcado`, sem
 * deixar a transação abortada nem lançamento órfão.
 *
 * O mês chega validado pela rota (formato e não futuro, FIN-18). Autora e momento vêm de `app_conta_id()` e `now()`
 * (SPEC_DEVIATION: sem `contaId` e `agora` na assinatura, como em T16). Toda consulta filtra por `grupo_id`.
 */

export type ResultadoMarcar =
  | { resultado: 'ok'; lancamentoId: string | null; valorCentavos: number | null }
  | { resultado: 'jogador_fora_do_mes' | 'ja_marcado' };

interface LinhaJogador {
  apelido: string;
}

interface LinhaPeriodo {
  inicio: string;
  fim: string | null;
}

async function marcar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  mes: string,
  hoje: string,
): Promise<ResultadoMarcar> {
  // Mesma trava dos escritores de período (AD-038, AD-078): `travarVarios` do repositório de jogadores.
  const travados = await jogadores.travarVarios(db, grupoId, [jogadorId]);
  if (travados.length === 0) return { resultado: 'jogador_fora_do_mes' };
  const j = await sql<LinhaJogador>`
    SELECT apelido FROM jogadores WHERE grupo_id = ${grupoId} AND id = ${jogadorId}`.execute(db);
  const jogador = j.rows[0];
  if (!jogador) return { resultado: 'jogador_fora_do_mes' };

  const periodos = await sql<LinhaPeriodo>`
    SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos
     WHERE grupo_id = ${grupoId} AND jogador_id = ${jogadorId}`.execute(db);
  if (!ativoNoMes(periodos.rows, mes)) return { resultado: 'jogador_fora_do_mes' };

  const existente = await sql`
    SELECT 1 FROM pagamentos_mes WHERE grupo_id = ${grupoId} AND jogador_id = ${jogadorId} AND mes = ${mes}`.execute(
    db,
  );
  if (existente.rows.length > 0) return { resultado: 'ja_marcado' };

  const entrada = entradaDaMensalidade(
    await configFinanceira.lerConfig(db, grupoId),
    jogador.apelido,
    mes,
    hoje,
  );

  await sql`SAVEPOINT marcar_pagamento`.execute(db);
  let lancamentoId: string | null = null;
  try {
    if (entrada) {
      const l = await sql<{ id: string }>`
        INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
        VALUES (${grupoId}, ${entrada.tipo}, ${entrada.data}::date, ${entrada.descricao}, ${entrada.valorCentavos},
                app_conta_id(), now(), app_conta_id(), now())
        RETURNING id`.execute(db);
      lancamentoId = l.rows[0]?.id ?? null;
    }
    await sql`
      INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
      VALUES (${grupoId}, ${jogadorId}, ${mes}, ${lancamentoId}, app_conta_id(), now())`.execute(
      db,
    );
  } catch (erro) {
    await sql`ROLLBACK TO SAVEPOINT marcar_pagamento`.execute(db);
    if ((erro as { code?: string }).code === '23505') return { resultado: 'ja_marcado' };
    throw erro;
  }
  await sql`RELEASE SAVEPOINT marcar_pagamento`.execute(db);

  // Fora do savepoint: falha da auditoria sobe e a transação da requisição desfaz pagamento e lançamento (FIN-21).
  await auditoria.registrar(db, grupoId, {
    acao: 'pagamento_marcado',
    entidade: 'pagamento_mes',
    entidadeId: jogadorId,
    resumo: { mes, valorCentavos: entrada?.valorCentavos ?? null },
  });
  return { resultado: 'ok', lancamentoId, valorCentavos: entrada?.valorCentavos ?? null };
}

export const financeiroPagamentos = { marcar };
