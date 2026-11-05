import { ErroApi } from './cliente.ts';

/**
 * Mensagem de cada campo de um 422 das rotas de grupo (GEL-118, T20): o corpo traz `campos` com os nomes e
 * `mensagens` com o texto de cada um (`corpoErro`). Campo listado sem mensagem recebe `MENSAGEM_CAMPO_PADRAO`.
 * Outro erro (rede, 404, 409) não marca campo nenhum: devolve `{}`.
 */

export const MENSAGEM_CAMPO_PADRAO = 'Confira este campo.';

export function mensagensDosCampos(erro: unknown): Record<string, string> {
  if (!(erro instanceof ErroApi) || erro.status !== 422) return {};
  const resultado: Record<string, string> = {};
  const corpo = erro.corpo;
  const mensagens =
    corpo !== null && typeof corpo === 'object' && 'mensagens' in corpo
      ? (corpo as { mensagens: unknown }).mensagens
      : undefined;
  if (mensagens !== null && typeof mensagens === 'object') {
    for (const [campo, texto] of Object.entries(mensagens as Record<string, unknown>)) {
      if (typeof texto === 'string' && texto !== '') resultado[campo] = texto;
    }
  }
  for (const campo of erro.campos) {
    if (!(campo in resultado)) resultado[campo] = MENSAGEM_CAMPO_PADRAO;
  }
  return resultado;
}
