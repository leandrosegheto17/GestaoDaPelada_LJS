// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `jspdf` só por `import()` dinâmico (partidas-e-ranking T50; PAR-102; BD:282-285): o PDF do ranking não pesa no
 * carregamento inicial. Duas provas: nenhum arquivo de `src/` importa o pacote de forma estática, e o manifesto do
 * build do Vite não põe o `jspdf` em nenhum chunk alcançável pelas entradas por imports estáticos.
 */

const WEB = join(import.meta.dirname, '..', '..');
const SRC = join(WEB, 'src');

interface EntradaManifesto {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}
type Manifesto = Record<string, EntradaManifesto>;

const EH_JSPDF = /(^|[/\\])jspdf([/\\@]|$)/;

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory()
      ? arquivos(caminho)
      : /\.(ts|tsx)$/.test(nome)
        ? [caminho]
        : [];
  });
}

/** Import estático do jspdf: `import ... from 'jspdf'`, `import 'jspdf'` ou `export ... from 'jspdf'` (não `import('jspdf')`). */
const IMPORT_ESTATICO =
  /(^|\n)\s*(import|export)\b[^;()]*?\bfrom\s*['"]jspdf['"]|(^|\n)\s*import\s*['"]jspdf['"]/;

/** Chaves do manifesto alcançáveis a partir das entradas só por imports estáticos: o carregamento inicial. */
function chunksIniciais(m: Manifesto): Set<string> {
  const vistos = new Set<string>();
  const fila = Object.keys(m).filter((k) => m[k]?.isEntry);
  while (fila.length > 0) {
    const k = fila.pop()!;
    if (vistos.has(k)) continue;
    vistos.add(k);
    for (const i of m[k]?.imports ?? []) fila.push(i);
  }
  return vistos;
}

describe('jspdf sob demanda', () => {
  it('PAR-102: nenhum arquivo de src importa o jspdf de forma estática', () => {
    const estaticos = arquivos(SRC)
      .filter((f) => IMPORT_ESTATICO.test(readFileSync(f, 'utf8')))
      .map((f) => relative(WEB, f));
    expect(estaticos).toEqual([]);
  });

  it('PAR-102: o detector pega o import estático e deixa passar o dinâmico', () => {
    expect(IMPORT_ESTATICO.test(`import { jsPDF } from 'jspdf';`)).toBe(true);
    expect(IMPORT_ESTATICO.test(`import 'jspdf';`)).toBe(true);
    expect(IMPORT_ESTATICO.test(`export { jsPDF } from "jspdf";`)).toBe(true);
    expect(IMPORT_ESTATICO.test(`const { jsPDF } = await import('jspdf');`)).toBe(false);
  });

  describe('manifesto do build', () => {
    let saida: string;
    let manifesto: Manifesto;

    beforeAll(async () => {
      saida = mkdtempSync(join(tmpdir(), 'web-build-jspdf-'));
      await build({
        root: WEB,
        configFile: join(WEB, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir: saida, emptyOutDir: true, manifest: true },
      });
      manifesto = JSON.parse(
        readFileSync(join(saida, '.vite', 'manifest.json'), 'utf8'),
      ) as Manifesto;
    }, 180_000);

    afterAll(() => {
      if (saida) rmSync(saida, { recursive: true, force: true });
    });

    it('PAR-102: nenhum chunk do carregamento inicial é do jspdf', () => {
      const iniciais = [...chunksIniciais(manifesto)];
      expect(iniciais.length).toBeGreaterThan(0);
      const comJspdf = iniciais.filter(
        (k) => EH_JSPDF.test(k) || EH_JSPDF.test(manifesto[k]?.src ?? ''),
      );
      expect(comJspdf).toEqual([]);
    });

    it('PAR-102: quando o app usa o jspdf (T68 em diante), ele sai num chunk só de import dinâmico', () => {
      const doJspdf = Object.keys(manifesto).filter((k) => EH_JSPDF.test(k));
      // Até a T68 nenhum código importa o pacote e não há chunk dele; daí em diante cada chunk do jspdf tem de ser
      // alcançado por um dynamicImports de alguém, nunca por imports estáticos (o teste anterior).
      const alcancadosPorDinamico = new Set(
        Object.values(manifesto).flatMap((e) => e.dynamicImports ?? []),
      );
      for (const k of doJspdf) {
        const raiz =
          alcancadosPorDinamico.has(k) ||
          Object.values(manifesto).some((e) =>
            (e.dynamicImports ?? []).some((d) => manifesto[d]?.imports?.includes(k)),
          );
        expect({ chunk: k, dinamico: raiz }).toEqual({ chunk: k, dinamico: true });
      }
    });
  });
});
