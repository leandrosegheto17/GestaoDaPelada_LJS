import { Hono } from 'hono';
import { mesFinanceiroConsulta, type MesFinanceiroResposta } from '@pelada/contrato';
import { MENSAGEM_MES_FORA_DO_HISTORICO, mesDe, mesNoHistoricoDoCaixa } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, mensagensDoZod, respostaDeCampo } from '../corpo.ts';
import { configFinanceira } from '../../infraestrutura/db/repositorios/financeiro/config.ts';
import { financeiroMes } from '../../infraestrutura/db/repositorios/financeiro/mes.ts';

/**
 * `GET /api/grupos/:grupoId/financeiro/mes?mes=AAAA-MM` (financeiro T26; FIN-07, FIN-08, FIN-09, FIN-14). Leitura: o
 * `comBanco` abre a transação `READ ONLY` (GET), e a cadeia vem antes (vínculo 404, `exigirFinanceiro` 403; a trava de
 * plano não age em GET, FIN-50; arquivado é lido pela criadora, FIN-37).
 *
 * - consulta pelo `mesFinanceiroConsulta` (T7): `mes` malformado (`2026-13`, `10-2026`) ou parâmetro extra dão 422 com
 *   "Mês inválido." no campo `mes` (ou a mensagem do campo extra);
 * - sem `mes`, o mês de `relogio.hoje()` em São Paulo (FIN-49);
 * - com configuração, mês fora do histórico (antes do mês da data do saldo inicial ou depois do mês de hoje) dá 422
 *   "Mês fora do histórico do caixa." no campo `mes` (FIN-09). Sem configuração não há histórico a conferir: 200 com os
 *   nulos (FIN-08), como manda a tarefa ("com configuração, fora do histórico → 422");
 * - responde com `financeiroMes.lerMes` (T17), que traz o mês, a data de hoje, a navegação, a configuração, o saldo, o
 *   resumo, os pagamentos e os lançamentos do mês do mais recente ao mais antigo (FIN-07, FIN-14).
 *
 * Molde: `GET …/simulador/contexto` (`rotas/simulador.ts:33`, consulta pelo zod).
 */
export function rotasFinanceiroMes(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/financeiro/mes', async (c) => {
    const consulta = mesFinanceiroConsulta.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();
    const mes = consulta.data.mes ?? mesDe(hoje);

    const config = await configFinanceira.lerConfig(c.var.db, grupoId);
    if (config !== null && !mesNoHistoricoDoCaixa(mes, config.dataSaldoInicial, hoje)) {
      return respostaDeCampo(c, 'mes', MENSAGEM_MES_FORA_DO_HISTORICO);
    }

    const resposta: MesFinanceiroResposta = await financeiroMes.lerMes(
      c.var.db,
      grupoId,
      mes,
      hoje,
    );
    return c.json(resposta, 200);
  });

  return rotas;
}
