import type { ErroDeCampo } from '../componentes/campos/ResumoErros';
import { ErroApi } from './erros';

/** Mensagem de cada campo, na chave do corpo enviado (`nome`, `horario`…). */
export type ErrosDeCampos = Record<string, string>;

/** Erros por campo do 422 da API (`campos`), ou `null` se o erro não for desse tipo (cópia do legado). */
export function deErroApi(erro: unknown): ErrosDeCampos | null {
  if (!(erro instanceof ErroApi) || !erro.campos || Object.keys(erro.campos).length === 0) return null;
  return { ...erro.campos };
}

/**
 * Itens do `ResumoErros` ("Corrija N campos: <rótulos>", GEL-118): um por campo com erro, na ordem do formulário,
 * apontando para a entrada de id `prefixo + campo`. Campo sem rótulo conhecido fica de fora do resumo (a mensagem
 * dele continua ao lado do campo).
 */
export function paraResumo(
  erros: ErrosDeCampos,
  ordem: readonly string[],
  rotulos: Readonly<Record<string, string>>,
  prefixo = '',
): ErroDeCampo[] {
  return ordem.filter((c) => erros[c] && rotulos[c]).map((c) => ({ idCampo: `${prefixo}${c}`, rotulo: rotulos[c]! }));
}

/** Resultado de `safeParse` de um schema do contrato (só o que precisamos dele). */
export type ResultadoValidacao =
  | { success: true }
  | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };

/** Erros por campo a partir das issues do schema; vale a primeira mensagem de cada campo (cópia do legado). */
export function deValidacao(resultado: ResultadoValidacao): ErrosDeCampos {
  const erros: ErrosDeCampos = {};
  if (resultado.success) return erros;
  for (const { path, message } of resultado.error.issues) {
    const campo = String(path[0] ?? '');
    if (campo && !(campo in erros)) erros[campo] = message;
  }
  return erros;
}
