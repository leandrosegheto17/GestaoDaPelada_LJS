import { corrigirPeriodoCorpo, dataCorpo, inicioCorpo, type CorrigirPeriodoResposta } from '@pelada/contrato';
import { Hono, type Context } from 'hono';
import * as jogadores from '../../infraestrutura/db/repositorios/jogadores.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo, type CorpoLido } from '../corpo.ts';
import { CODIGOS_ERRO, erroComStatus, naoEncontrado } from '../erros.ts';
import { detalhe, recusaDeCampo, UUID } from './jogadores.ts';

/** Corpo de inativar e reativar: vazio vale `{}` (a data é opcional, GEL-52, GEL-55). */
async function lerData(c: Context<AppEnv>): Promise<CorpoLido<{ data?: string | undefined }>> {
  if ((await c.req.text()).trim() === '') return { ok: true, dado: {} };
  return lerCorpo(c, dataCorpo);
}

/** A ficha atualizada depois de uma escrita de período. */
async function responderFicha(c: Context<AppEnv>, grupoId: string, jogadorId: string): Promise<Response> {
  const lido = await jogadores.ler(c.var.db, grupoId, jogadorId);
  if (!lido) return naoEncontrado(c);
  return c.json(detalhe(lido));
}

/**
 * Escritas de período (grupos-e-elenco, design C6; GEL-51 a GEL-58, GEL-71 a GEL-83). Todas passam pelo repositório
 * de jogadores, com o jogador travado (GEL-109). "Hoje" vem só do relógio da requisição (AD-015). A recusa de uma
 * regra de período vai no campo da data do pedido.
 */
export const rotaPeriodos = new Hono<AppEnv>()
  .post('/api/grupos/:grupoId/jogadores/:id/inativar', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    const corpo = await lerData(c);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.inativar(c.var.db, grupoId, id, corpo.dado.data, c.var.relogio.hoje());
    if (!r) return naoEncontrado(c);
    if (!r.ok) {
      if ('codigo' in r) return erroComStatus(c, 409, CODIGOS_ERRO.jaInativo, 'O jogador já está inativo.');
      return recusaDeCampo(c, 'data', r.mensagem);
    }
    return responderFicha(c, grupoId, id);
  })
  .post('/api/grupos/:grupoId/jogadores/:id/reativar', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    const corpo = await lerData(c);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.reativar(c.var.db, grupoId, id, corpo.dado.data, c.var.relogio.hoje());
    if (!r) return naoEncontrado(c);
    if (!r.ok) {
      if ('codigo' in r) return erroComStatus(c, 409, CODIGOS_ERRO.jaAtivo, 'O jogador já está ativo.');
      return recusaDeCampo(c, 'data', r.mensagem);
    }
    return responderFicha(c, grupoId, id);
  })
  .patch('/api/grupos/:grupoId/jogadores/:id/periodos/:periodoId', async (c) => {
    const id = c.req.param('id');
    const periodoId = c.req.param('periodoId');
    if (!UUID.test(id) || !UUID.test(periodoId)) return naoEncontrado(c);
    const corpo = await lerCorpo(c, corrigirPeriodoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const r = await jogadores.corrigirPeriodo(
      c.var.db,
      c.req.param('grupoId'),
      id,
      periodoId,
      corpo.dado,
      c.var.relogio.hoje(),
    );
    if (!r) return naoEncontrado(c);
    // A recusa vai no campo do pedido (saida ou retorno) que a regra apontou (GEL-72, GEL-73).
    if (!r.ok) return recusaDeCampo(c, r.campo, r.mensagem);
    const resposta: CorrigirPeriodoResposta = r.alterado
      ? { alterado: true, periodos: r.periodos }
      : { alterado: false, mensagem: 'Nada a alterar.', periodos: r.periodos };
    return c.json(resposta);
  })
  .put('/api/grupos/:grupoId/jogadores/:id/inicio', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    const corpo = await lerCorpo(c, inicioCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await jogadores.alterarInicio(c.var.db, grupoId, id, corpo.dado.data, c.var.relogio.hoje());
    if (!r) return naoEncontrado(c);
    if (!r.ok) return recusaDeCampo(c, r.campo, r.mensagem);
    return responderFicha(c, grupoId, id);
  });
