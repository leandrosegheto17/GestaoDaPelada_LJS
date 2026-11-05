import { Hono } from 'hono';
import { escalacaoCorpo, idsDaComposicao, MENSAGEM_APTOS_INATIVOS, type EscalacaoResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { escalacoes } from '../../infraestrutura/db/repositorios/escalacoes.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';

/**
 * `POST /api/grupos/:grupoId/escalacoes` (T37 da simulador; SIM-67, SIM-71, SIM-72, SIM-93). A cadeia do grupo vem
 * antes (sessão, transação, vínculo, grupo ativo: 409 `grupo_arquivado` também quando o grupo foi arquivado depois da
 * sugestão, SIM-93) e a trava do recurso `simulador` (T32).
 *
 * - corpo pelo `escalacaoCorpo`: formato, data, N, K só em 2 times e a composição, sem jogador repetido (SIM-71,
 *   "Há jogador repetido na composição." no campo `composicao`);
 * - todo jogador da composição precisa ser ativo do grupo na data; inativo, inexistente ou de outro grupo dão a mesma
 *   mensagem no campo `composicao`, sem dizer qual (SIM-71, SIM-80);
 * - a composição ajustada é aceita como veio: time sem N titulares, trocas fora da sugestão, avisos não bloqueiam
 *   (SIM-72);
 * - grava pelo `escalacoes.confirmar` com a conta da sessão e o momento do relógio e responde 201 com `data` e
 *   `confirmadaEm` (SIM-67); o 4xx desfaz a transação no `comBanco`, então nada é gravado.
 *
 * Molde: `POST …/jogadores` (`rotas/jogadores.ts:22`); o `POST partidas` de `PR:1461` ainda não existe.
 */
export function rotasEscalacoes(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.post('/grupos/:grupoId/escalacoes', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, escalacaoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const dados = corpo.dados;

    const ativos = new Set((await jogadoresLeitura.paraSimulador(c.var.db, grupoId, dados.data)).map((a) => a.id));
    const escalada =
      dados.formato === 'dois_times'
        ? { formato: 'dois_times' as const, composicao: dados.composicao }
        : { formato: 'varios_times' as const, composicao: dados.composicao };
    if (!idsDaComposicao(escalada).every((id) => ativos.has(id))) {
      return respostaDeCampo(c, 'composicao', MENSAGEM_APTOS_INATIVOS);
    }

    // A cadeia do grupo só deixa chegar aqui com sessão: a conta existe.
    const conta = c.var.contaId ?? '';
    const gravada = await escalacoes.confirmar(
      c.var.db,
      grupoId,
      { data: dados.data, n: dados.n, ...(dados.formato === 'dois_times' ? { k: dados.k } : {}), escalada },
      conta,
      c.var.relogio.agoraIso(),
    );
    const resposta: EscalacaoResposta = gravada;
    return c.json(resposta, 201);
  });

  return rotas;
}
