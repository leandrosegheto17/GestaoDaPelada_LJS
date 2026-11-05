import type { MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';

/**
 * Cabeçalho `X-Pelada: 1` em toda escrita de /api/* (T18; ACE-49). Formulário de outro site
 * não consegue mandar cabeçalho próprio sem um preflight que o Worker não autoriza; por isso a
 * escrita sem ele é recusada com 403. Fica em `criarApp` antes de qualquer `limiteTaxa`, para
 * a recusa não gastar a cota de nenhum limitador.
 *
 * Escrita é todo método fora de GET e HEAD (o mesmo critério do `READ ONLY` do `comBanco`).
 * O valor tem de ser exatamente `1`; o nome do cabeçalho não diferencia maiúsculas (HTTP).
 *
 * Única exceção (planos-e-cobranca T35; AD-093): `POST /api/webhooks/asaas`, que o Asaas chama sem o cabeçalho e que
 * se autentica pelo `asaas-access-token`. Só o POST nesse caminho exato; outro método nele continua exigindo.
 */

export const NOME_CABECALHO_PELADA = 'X-Pelada';
export const VALOR_CABECALHO_PELADA = '1';

/** Caminho do webhook do Asaas, isento do `X-Pelada` (AD-093). */
export const CAMINHO_WEBHOOK_ASAAS = '/api/webhooks/asaas';

function ehLeitura(metodo: string): boolean {
  const m = metodo.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

function ehWebhookAsaas(metodo: string, caminho: string): boolean {
  return metodo.toUpperCase() === 'POST' && caminho === CAMINHO_WEBHOOK_ASAAS;
}

export const exigirCabecalhoPelada: MiddlewareHandler<Ambiente> = async (c, next) => {
  if (
    !ehLeitura(c.req.method) &&
    !ehWebhookAsaas(c.req.method, c.req.path) &&
    c.req.header(NOME_CABECALHO_PELADA) !== VALOR_CABECALHO_PELADA
  ) {
    return c.json(corpoDoErro('origem_recusada'), 403);
  }
  await next();
};
