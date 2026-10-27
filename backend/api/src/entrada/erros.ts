import type { Context } from 'hono';

/** Códigos de erro da API (os mesmos do contrato do legado). */
export const CODIGOS_ERRO = {
  naoEncontrado: 'nao_encontrado',
  erroInterno: 'erro_interno',
  requisicaoRecusada: 'requisicao_recusada',
  muitasRequisicoes: 'muitas_requisicoes',
  corpoGrande: 'corpo_grande',
  sessaoExpirada: 'sessao_expirada',
} as const;

/** Erro padrão da API: `{ erro: { codigo, mensagem, campos? } }`. */
export interface ErroPadrao {
  erro: { codigo: string; mensagem: string; campos?: Record<string, string> };
}

export function corpoErro(codigo: string, mensagem: string, campos?: Record<string, string>): ErroPadrao {
  return { erro: { codigo, mensagem, ...(campos ? { campos } : {}) } };
}

export function naoEncontrado(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.naoEncontrado, 'Recurso não encontrado.'), 404);
}

export function erroInterno(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.erroInterno, 'Não foi possível concluir a operação.'), 500);
}

export function requisicaoRecusada(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.requisicaoRecusada, 'Requisição recusada.'), 403);
}

export function corpoGrande(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.corpoGrande, 'O corpo da requisição é grande demais.'), 413);
}

export function muitasRequisicoes(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.muitasRequisicoes, 'Muitas requisições. Tente de novo em instantes.'), 429);
}

export function sessaoExpirada(c: Context): Response {
  return c.json(corpoErro(CODIGOS_ERRO.sessaoExpirada, 'Sua sessão expirou. Entre de novo.'), 401);
}
