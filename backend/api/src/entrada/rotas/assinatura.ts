import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  assinaturaCorpo,
  corpoDoErro,
  MENSAGEM_PAGAMENTO_INDISPONIVEL,
  MENSAGENS_ERRO_PLANO,
  type AssinaturaCriada,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { assinar, type ResultadoAssinar } from '../../aplicacao/plano/assinar.ts';

/**
 * `POST /api/grupos/:grupoId/assinatura` (planos-e-cobranca T33; PLA-30 a PLA-33, PLA-60; AD-091). A cadeia das rotas
 * de grupo vem antes: sessão (401), `LIMITE_ESCRITA` por conta (429, PLA-60), transação com a conta, vínculo (404) e
 * grupo ativo (409 `grupo_arquivado`); a assinatura fica fora da trava de somente leitura (AD-092). Corpo
 * `assinaturaCorpo` (nome e CPF, sem campo de cartão, PLA-34); o CPF segue só para o Asaas (PLA-35).
 *
 * Respostas (AD-091):
 * - 201 `{ faturaUrl }`: assinatura `aguardando_pagamento` gravada; o plano não muda (PLA-31);
 * - 403 `so_quem_criou`: quem não criou o grupo, sem chamar o Asaas (PLA-32);
 * - 409 `assinatura_pendente` com a fatura em aberto, ou `assinatura_ativa` (PLA-33);
 * - 502 `pagamento_indisponivel` com a mensagem da spec, sem gravar (PLA-36);
 * - 422 do corpo (nome, CPF), como as outras rotas.
 */

function responder(c: Context<Ambiente>, r: ResultadoAssinar): Response {
  switch (r.resultado) {
    case 'criada': {
      const corpo: AssinaturaCriada = { faturaUrl: r.faturaUrl };
      return c.json(corpo, 201);
    }
    case 'assinatura_pendente':
      return c.json(
        { erro: 'assinatura_pendente', faturaUrl: r.faturaUrl, mensagem: MENSAGENS_ERRO_PLANO.assinatura_pendente },
        409,
      );
    case 'assinatura_ativa':
      return c.json({ erro: 'assinatura_ativa', faturaUrl: r.faturaUrl, mensagem: MENSAGENS_ERRO_PLANO.assinatura_ativa }, 409);
    case 'so_quem_criou':
      return c.json(corpoDoErro('so_quem_criou'), 403);
    case 'nao_encontrado':
      return c.json(corpoDoErro('nao_encontrado'), 404);
    case 'pagamento_indisponivel':
      return c.json({ erro: 'pagamento_indisponivel', mensagem: MENSAGEM_PAGAMENTO_INDISPONIVEL }, 502);
  }
}

export function rotasAssinatura(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.post('/grupos/:grupoId/assinatura', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, assinaturaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const conta = c.var.contaId;
    if (conta === undefined) return c.json(corpoDoErro('nao_encontrado'), 404);
    const r = await assinar(c.var.db, c.var.asaas, {
      grupoId: c.req.param('grupoId'),
      conta,
      nome: corpo.dados.nome,
      cpf: corpo.dados.cpf,
      hoje: c.var.relogio.hoje(),
    });
    return responder(c, r);
  });

  return rotas;
}
