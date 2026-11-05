import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Conferência dos caminhos `mockup` do `.specs/mockup/telas.json` (grupos-e-elenco T52; GEL-116). Toda entrada com
 * `mockup` (em `telas`, `revisaoManual` ou qualquer outra lista do mapa) aponta, a partir da pasta do `telas.json`,
 * para um arquivo que existe no disco: o mockup do projeto (`telas/...`) ou o de um módulo
 * (`../features/<feature>/mockup/telas/...`, copiado byte a byte pelo `reuso.md` da feature).
 */

/**
 * As entradas cujo `mockup` não existe, como `<lista>: <id> <estado> → <caminho>`.
 * @param {Record<string, unknown>} mapa o `telas.json` lido
 * @param {string} pastaDoMapa a pasta do `telas.json` (os caminhos são relativos a ela)
 * @param {(caminho: string) => boolean} [existe]
 */
export function mockupsAusentes(mapa, pastaDoMapa, existe = existsSync) {
  const ausentes = [];
  for (const [lista, valor] of Object.entries(mapa)) {
    if (!Array.isArray(valor)) continue;
    for (const entrada of valor) {
      if (typeof entrada !== 'object' || entrada === null || typeof entrada.mockup !== 'string') continue;
      if (!existe(resolve(pastaDoMapa, entrada.mockup))) {
        ausentes.push(`${lista}: ${entrada.id ?? '?'} ${entrada.estado ?? '?'} → ${entrada.mockup}`);
      }
    }
  }
  return ausentes;
}
