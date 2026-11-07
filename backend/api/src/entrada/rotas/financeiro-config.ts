import { Hono } from 'hono';
import { configFinanceiraCorpo, type ConfigFinanceiraResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { configFinanceira } from '../../infraestrutura/db/repositorios/financeiro/config.ts';

/**
 * `PUT /api/grupos/:grupoId/financeiro/config` (financeiro T25; FIN-01, FIN-02, FIN-03, FIN-04). A cadeia vem antes:
 * sessão, transação e vínculo (404), grupo ativo (409 `grupo_arquivado`), LIMITE_ESCRITA (`limitarEscritasDeGrupo`,
 * global nas escritas de /api/grupos*), `exigirFinanceiro` (403 `sem_permissao_financeiro`) e a trava de plano nas
 * escritas (403 `plano_pro`), estas duas pelo `travarFinanceiro` (AD-077).
 *
 * - corpo pelo `configFinanceiraCorpo` (T7): valor não inteiro, fora da faixa, texto, data inválida ou campo extra dão
 *   422 com a mensagem de cada campo (FIN-03);
 * - `dataSaldoInicial` depois de `relogio.hoje()` (São Paulo) dá 422 no campo, sem gravar (FIN-02); hoje é aceito;
 * - grava pelo `configFinanceira.salvarConfig` (T16), que audita antes e depois na mesma transação (FIN-04), e responde
 *   200 com os três campos gravados (FIN-01).
 *
 * Molde: `PATCH …/jogadores/:id` (`rotas/jogador.ts:44`) e `POST …/escalacoes` (`rotas/escalacoes.ts:27`).
 */

export const MENSAGEM_DATA_SALDO_FUTURA = 'A data do saldo inicial não pode ser no futuro.';

export function rotasFinanceiroConfig(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.put('/grupos/:grupoId/financeiro/config', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, configFinanceiraCorpo);
    if (!corpo.ok) return corpo.resposta;
    // Datas `AAAA-MM-DD`: a ordem do texto é a do calendário.
    if (corpo.dados.dataSaldoInicial > c.var.relogio.hoje()) {
      return respostaDeCampo(c, 'dataSaldoInicial', MENSAGEM_DATA_SALDO_FUTURA);
    }

    const { depois } = await configFinanceira.salvarConfig(
      c.var.db,
      c.req.param('grupoId'),
      corpo.dados,
    );
    const resposta: ConfigFinanceiraResposta = depois;
    return c.json(resposta, 200);
  });

  return rotas;
}
