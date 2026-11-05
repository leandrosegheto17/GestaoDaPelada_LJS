import type { Context } from 'hono';
import { Hono } from 'hono';
import { arquivarCorpo, corpoDoErro, MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo, respostaDeCampo } from '../corpo.ts';
import { assinaturaBloqueia } from '../../aplicacao/plano/assinatura-bloqueia.ts';
import { grupos } from '../../infraestrutura/db/repositorios/grupos.ts';
import {
  gruposEstado,
  type ResultadoEstado,
} from '../../infraestrutura/db/repositorios/grupos-estado.ts';
import { detalheDoGrupo } from './grupo.ts';

/**
 * `POST /api/grupos/:grupoId/arquivar` e `…/reativar` (T30; GEL-22 a GEL-24, GEL-28, GEL-29), da tabela de
 * `GD:170-171`. A cadeia do grupo vem antes (vínculo, 404; o `exigirGrupoAtivo` deixa as duas passarem com o grupo
 * arquivado, T22). Respostas: 200 com o detalhe do grupo (também quando o estado já era o pedido, GEL-29); 422 no campo
 * `nomeConfirmacao` (GEL-23); 403 `so_quem_criou` (GEL-24); 404 quando a conta não vê o grupo ou a criadora foi
 * removida.
 */

/** GEL-23, texto da spec (`GS:142`). */
export const MENSAGEM_NOME_NAO_CONFERE = 'O nome digitado não confere com o nome do grupo.';

async function responder(
  c: Context<Ambiente>,
  grupoId: string,
  r: ResultadoEstado,
): Promise<Response> {
  switch (r.resultado) {
    case 'nao_encontrado':
      return c.json(corpoDoErro('nao_encontrado'), 404);
    case 'so_quem_criou':
      return c.json(corpoDoErro('so_quem_criou'), 403);
    case 'nome_nao_confere':
      return respostaDeCampo(c, 'nomeConfirmacao', MENSAGEM_NOME_NAO_CONFERE);
    case 'ok': {
      const g = await grupos.ler(c.var.db, grupoId);
      if (!g) return c.json(corpoDoErro('nao_encontrado'), 404);
      return c.json(detalheDoGrupo(c.env.URL_PUBLICA, g), 200);
    }
  }
}

export function rotasGrupoEstado(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.post('/grupos/:grupoId/arquivar', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, arquivarCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    // Assinatura pendente ou ativa: 409, sem arquivar (planos-e-cobranca T38; PLA-69, AD-115).
    const conta = c.var.contaId;
    if (
      conta !== undefined &&
      (await assinaturaBloqueia.bloqueiaArquivar(c.var.db, grupoId, conta))
    ) {
      return c.json(
        { erro: 'assinatura_ativa', mensagem: MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR },
        409,
      );
    }
    return responder(
      c,
      grupoId,
      await gruposEstado.arquivar(c.var.db, grupoId, corpo.dados.nomeConfirmacao),
    );
  });

  rotas.post('/grupos/:grupoId/reativar', async (c) => {
    const grupoId = c.req.param('grupoId');
    return responder(c, grupoId, await gruposEstado.reativar(c.var.db, grupoId));
  });

  return rotas;
}
