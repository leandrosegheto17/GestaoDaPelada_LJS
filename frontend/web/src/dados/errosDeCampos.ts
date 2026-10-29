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
