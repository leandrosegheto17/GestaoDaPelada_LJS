// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mockupsAusentes } from '../../e2e/ferramentas/telas-json.mjs';

/**
 * Todo `mockup` do `telas.json` existe no disco (grupos-e-elenco T52; GEL-116), inclusive os 36 arquivos do mockup do
 * módulo copiados para `.specs/features/grupos-e-elenco/mockup/` (`reuso.md`, R-01 a R-36).
 *
 * SPEC_DEVIATION: a tarefa nomeia `e2e/ferramentas/telas-json.test.mjs`; o Vitest do web só lê `test/**`, então a
 * função fica em `e2e/ferramentas/telas-json.mjs` e o teste aqui, como `comparar` e `telas-reais` (molde).
 */

const ARQUIVO = fileURLToPath(new URL('../../../../.specs/mockup/telas.json', import.meta.url));
const MAPA = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Record<string, unknown>;
const PASTA = dirname(ARQUIVO);

describe('mockups do telas.json', () => {
  it('GEL-116: todo mockup do telas.json existe no disco', () => {
    expect(mockupsAusentes(MAPA, PASTA)).toEqual([]);
  });

  it('GEL-116: as entradas do módulo apontam para o mockup copiado da feature', () => {
    const telas = (MAPA['telas'] as Array<{ mockup?: string }>).filter((t) =>
      t.mockup?.startsWith('../features/grupos-e-elenco/mockup/'),
    );
    expect(telas.length).toBeGreaterThan(0);
  });

  it('GEL-116: um caminho inválido de exemplo reprova', () => {
    const mapa = {
      telas: [
        {
          id: 'T08',
          estado: 'sucesso',
          mockup: '../features/grupos-e-elenco/mockup/telas/t08-grupos--sucesso.html',
        },
        {
          id: 'T99',
          estado: 'inexistente',
          mockup: '../features/grupos-e-elenco/mockup/telas/nao-existe.html',
        },
      ],
      revisaoManual: [{ id: 'T98', estado: 'x', mockup: 'telas/tambem-nao-existe.html' }],
      viewports: { pc: { width: 1 } },
    };
    expect(mockupsAusentes(mapa, PASTA)).toEqual([
      'telas: T99 inexistente → ../features/grupos-e-elenco/mockup/telas/nao-existe.html',
      'revisaoManual: T98 x → telas/tambem-nao-existe.html',
    ]);
  });

  it('GEL-116: entrada sem mockup e listas que não são de telas são ignoradas', () => {
    const mapa = {
      telas: [{ id: 'T00', estado: 'sem' }],
      respostas: [{ url: '**/api/x', arquivo: 'y.json' }],
    };
    expect(mockupsAusentes(mapa, PASTA, () => false)).toEqual([]);
  });
});
