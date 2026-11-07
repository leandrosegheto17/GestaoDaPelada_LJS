import { Hono } from 'hono';
import {
  corpoDoErro,
  MENSAGEM_JOGADOR_FORA_DO_MES,
  MENSAGEM_MES_INVALIDO,
  MENSAGENS_ERRO_FINANCEIRO,
  mesFinanceiro,
  pagamentoCorpo,
} from '@pelada/contrato';
import {
  MENSAGEM_MES_FORA_DO_HISTORICO,
  MENSAGEM_MES_FUTURO,
  mesFuturo,
  mesNoHistoricoDoCaixa,
} from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { configFinanceira } from '../../infraestrutura/db/repositorios/financeiro/config.ts';
import { financeiroPagamentos } from '../../infraestrutura/db/repositorios/financeiro/pagamentos.ts';
import { financeiroPagamentosDesmarcar } from '../../infraestrutura/db/repositorios/financeiro/pagamentos-desmarcar.ts';

/**
 * Pagamentos da mensalidade (financeiro T27; FIN-16 a FIN-20, FIN-22, FIN-23). A cadeia vem antes: vínculo (404), grupo
 * ativo (409), LIMITE_ESCRITA, `exigirFinanceiro` (403) e a trava de plano nas escritas (403 `plano_pro`).
 *
 * `POST …/financeiro/pagamentos`, corpo `{ jogadorId, mes }` (T8):
 * - corpo inválido (id que não é uuid, mês malformado, campo extra, valor no corpo): 422 com a mensagem do campo;
 * - mês depois do mês de hoje (São Paulo): 422 no campo `mes` (FIN-18); o mês de hoje e os passados são aceitos;
 * - mês antes do mês da data inicial do caixa (com configuração): 422 "Mês fora do histórico do caixa." no campo `mes`;
 * - jogador inativo no mês, de outro grupo ou inexistente: 422 no campo `jogadorId`, a mesma mensagem nos três (FIN-19);
 * - já marcado, inclusive em corrida: 409 `pagamento_ja_marcado` (FIN-20);
 * - marcado: 204; o repositório (T18) cria o pagamento, a entrada da mensalidade quando há (FIN-16, FIN-17) e a
 *   auditoria, numa transação (FIN-21).
 *
 * `DELETE …/financeiro/pagamentos/:jogadorId/:mes`:
 * - mês malformado: 422 "Mês inválido." no campo `mes`; id que não é uuid: 404 (como jogador inexistente);
 * - sem pagamento (inclusive o segundo de dois DELETE simultâneos): 404 (FIN-23);
 * - desmarcado: 204; o repositório (T19) apaga o pagamento e a entrada vinculada, mesmo editada, e audita (FIN-22).
 *
 * Os 4xx desfazem a transação no `comBanco`: nada é gravado. Molde: `POST …/escalacoes` (`rotas/escalacoes.ts:27`) e
 * `DELETE …/jogadores/:id` (`rotas/jogador.ts:60`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function corpoPagamentoJaMarcado() {
  return {
    erro: MENSAGENS_ERRO_FINANCEIRO.pagamento_ja_marcado,
    codigo: 'pagamento_ja_marcado' as const,
  };
}

export function rotasFinanceiroPagamentos(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.post('/grupos/:grupoId/financeiro/pagamentos', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, pagamentoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const hoje = c.var.relogio.hoje();
    const { jogadorId, mes } = corpo.dados;
    if (mesFuturo(mes, hoje)) return respostaDeCampo(c, 'mes', MENSAGEM_MES_FUTURO);
    // Mês antes da data inicial do caixa: o `GET …/mes` o recusa (FIN-09), então marcar nele criaria um pagamento (e a
    // entrada, que entra no saldo) que nenhuma tela alcança. Sem configuração não há histórico a respeitar.
    const config = await configFinanceira.lerConfig(c.var.db, c.req.param('grupoId'));
    if (config !== null && !mesNoHistoricoDoCaixa(mes, config.dataSaldoInicial, hoje))
      return respostaDeCampo(c, 'mes', MENSAGEM_MES_FORA_DO_HISTORICO);

    const r = await financeiroPagamentos.marcar(
      c.var.db,
      c.req.param('grupoId'),
      jogadorId,
      mes,
      hoje,
    );
    if (r.resultado === 'jogador_fora_do_mes')
      return respostaDeCampo(c, 'jogadorId', MENSAGEM_JOGADOR_FORA_DO_MES);
    if (r.resultado === 'ja_marcado') return c.json(corpoPagamentoJaMarcado(), 409);
    return c.body(null, 204);
  });

  rotas.delete('/grupos/:grupoId/financeiro/pagamentos/:jogadorId/:mes', async (c) => {
    const mes = c.req.param('mes');
    if (!mesFinanceiro.safeParse(mes).success)
      return respostaDeCampo(c, 'mes', MENSAGEM_MES_INVALIDO);
    const jogadorId = c.req.param('jogadorId');
    if (!UUID.test(jogadorId)) return c.json(naoEncontrado, 404);

    const r = await financeiroPagamentosDesmarcar.desmarcar(
      c.var.db,
      c.req.param('grupoId'),
      jogadorId,
      mes,
    );
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    return c.body(null, 204);
  });

  return rotas;
}
