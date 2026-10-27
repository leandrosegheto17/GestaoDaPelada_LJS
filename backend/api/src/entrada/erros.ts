import type { Context } from 'hono';

/** Códigos de erro da API (os mesmos do contrato do legado). */
export const CODIGOS_ERRO = {
  naoEncontrado: 'nao_encontrado',
  erroInterno: 'erro_interno',
  requisicaoRecusada: 'requisicao_recusada',
  muitasRequisicoes: 'muitas_requisicoes',
  corpoGrande: 'corpo_grande',
  sessaoExpirada: 'sessao_expirada',
  dadosInvalidos: 'dados_invalidos',
  termosObrigatorios: 'termos_obrigatorios',
  credenciaisInvalidas: 'credenciais_invalidas',
  emailNaoConfirmado: 'email_nao_confirmado',
  bloqueadoTemporariamente: 'bloqueado_temporariamente',
  linkInvalido: 'link_invalido',
  emailIndisponivel: 'email_indisponivel',
  senhaAtualIncorreta: 'senha_atual_incorreta',
  unicoAdmin: 'unico_admin',
  conviteDeOutroEmail: 'convite_de_outro_email',
  contaExistente: 'conta_existente',
  jaEAdmin: 'ja_e_admin',
  ultimoAdmin: 'ultimo_admin',
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

/** Erro com código e mensagem próprios (as rotas de conta e acesso). */
export function erroComStatus(
  c: Context,
  status: 401 | 403 | 404 | 409 | 410 | 422 | 429 | 503,
  codigo: string,
  mensagem: string,
  campos?: Record<string, string>,
): Response {
  return c.json(corpoErro(codigo, mensagem, campos), status);
}

export function emailIndisponivel(c: Context): Response {
  return erroComStatus(
    c,
    503,
    CODIGOS_ERRO.emailIndisponivel,
    'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
  );
}

export function linkInvalido(c: Context): Response {
  return erroComStatus(c, 410, CODIGOS_ERRO.linkInvalido, 'Link inválido ou vencido.');
}
