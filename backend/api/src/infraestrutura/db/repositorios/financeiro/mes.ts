import { sql } from 'kysely';
import type { MesFinanceiroResposta } from '@pelada/contrato';
import {
  ativosNoMes,
  navegacao,
  resumoDoMes,
  saldoAtual,
  type JogadorComPeriodos,
  type MovimentoCaixa,
} from '@pelada/dominio';
import type { Db } from '../tipos.ts';
import { configFinanceira } from './config.ts';

/**
 * Leitura do mês do caixa (financeiro T17; FIN-07, FIN-08, FIN-10 a FIN-14). Busca a configuração, os lançamentos, os
 * pagamentos do mês e os períodos dos jogadores, e monta a resposta com o domínio (`saldoAtual`, `ativosNoMes`,
 * `resumoDoMes`, `navegacao`). As somas são do domínio, sobre os inteiros lidos do banco (`int4` como `number`): nunca
 * um `SUM` convertido em `numeric` (FIN-13), e o estouro do inteiro seguro lança `ErroEstouroCentavos`.
 *
 * O mês chega validado pela rota (FIN-09, T26): aqui não se confere o histórico. Sem configuração, a resposta tem
 * configuração, saldo e resumo nulos, listas vazias e navegação nula, sem consultar mais nada (FIN-08).
 *
 * Os lançamentos buscados vão de `min(data do saldo inicial, 1º dia do mês)` a `max(hoje, último dia do mês)`: o
 * saldo precisa do intervalo `[data inicial, hoje]` e a lista, do mês. A lista devolve só os do mês, do mais recente ao
 * mais antigo (data, depois momento de criação, depois id), com `mensalidade` verdadeiro quando existe pagamento com
 * aquele `lancamento_id` (FIN-14). Toda consulta filtra por `grupo_id`, além da RLS.
 */

interface LinhaLancamento {
  id: string;
  tipo: 'entrada' | 'saida';
  data: string;
  descricao: string;
  valor_centavos: number;
  mensalidade: boolean;
}

interface LinhaPeriodo {
  jogador_id: string;
  apelido: string;
  inicio: string;
  fim: string | null;
}

/** Jogadores do grupo com os períodos que tocam o mês, no formato do domínio. */
async function jogadoresDoMes(db: Db, grupoId: string, mes: string): Promise<JogadorComPeriodos[]> {
  const r = await sql<LinhaPeriodo>`
    SELECT j.id AS jogador_id, j.apelido, p.inicio::text AS inicio, p.fim::text AS fim
      FROM jogadores j
      JOIN periodos_ativos p ON p.jogador_id = j.id AND p.grupo_id = j.grupo_id
     WHERE j.grupo_id = ${grupoId}
       AND p.inicio < ((${mes} || '-01')::date + interval '1 month')
       AND (p.fim IS NULL OR p.fim > (${mes} || '-01')::date)
     ORDER BY j.id, p.inicio`.execute(db);
  const porJogador = new Map<string, { jogadorId: string; apelido: string; periodos: Array<{ inicio: string; fim: string | null }> }>();
  for (const l of r.rows) {
    const j = porJogador.get(l.jogador_id) ?? { jogadorId: l.jogador_id, apelido: l.apelido, periodos: [] };
    j.periodos.push({ inicio: l.inicio, fim: l.fim });
    porJogador.set(l.jogador_id, j);
  }
  return [...porJogador.values()];
}

async function lerMes(db: Db, grupoId: string, mes: string, hoje: string): Promise<MesFinanceiroResposta> {
  const config = await configFinanceira.lerConfig(db, grupoId);
  if (config === null) {
    return {
      mes,
      hoje,
      navegacao: { mesAnterior: null, mesSeguinte: null },
      config: null,
      saldoAtualCentavos: null,
      resumoMes: null,
      pagamentos: [],
      lancamentos: [],
    };
  }

  const lancamentos = await sql<LinhaLancamento>`
    SELECT l.id, l.tipo, l.data::text AS data, l.descricao, l.valor_centavos,
           EXISTS (SELECT 1 FROM pagamentos_mes p WHERE p.lancamento_id = l.id AND p.grupo_id = l.grupo_id) AS mensalidade
      FROM lancamentos l
     WHERE l.grupo_id = ${grupoId}
       AND l.data >= LEAST(${config.dataSaldoInicial}::date, (${mes} || '-01')::date)
       AND l.data <= GREATEST(${hoje}::date, ((${mes} || '-01')::date + interval '1 month' - interval '1 day')::date)
     ORDER BY l.data DESC, l.criado_em DESC, l.id DESC`.execute(db);
  const pagos = await sql<{ jogador_id: string }>`
    SELECT jogador_id FROM pagamentos_mes WHERE grupo_id = ${grupoId} AND mes = ${mes}`.execute(db);

  const movimentos: MovimentoCaixa[] = lancamentos.rows.map((l) => ({
    tipo: l.tipo,
    data: l.data,
    valorCentavos: Number(l.valor_centavos),
  }));
  const ativos = ativosNoMes(await jogadoresDoMes(db, grupoId, mes), mes);
  const { resumo, pagamentos } = resumoDoMes(
    movimentos,
    ativos,
    pagos.rows.map((p) => p.jogador_id),
    mes,
  );

  return {
    mes,
    hoje,
    navegacao: navegacao(mes, config.dataSaldoInicial, hoje),
    config,
    saldoAtualCentavos: saldoAtual(config, movimentos, hoje),
    resumoMes: resumo,
    pagamentos,
    lancamentos: lancamentos.rows
      .filter((l) => l.data.startsWith(`${mes}-`))
      .map((l) => ({
        id: l.id,
        tipo: l.tipo,
        data: l.data,
        descricao: l.descricao,
        valorCentavos: Number(l.valor_centavos),
        mensalidade: l.mensalidade,
      })),
  };
}

export const financeiroMes = { lerMes };
