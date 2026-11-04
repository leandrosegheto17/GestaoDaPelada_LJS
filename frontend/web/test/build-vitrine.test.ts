import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const pastas: string[] = [];

/** Gera o build numa pasta temporária e devolve o texto de todos os .js e .css (o mapa de código-fonte fica de fora). */
async function construir(vitrine: boolean): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), 'pelada-build-'));
  pastas.push(outDir);
  const anterior = process.env.VITE_VITRINE;
  if (vitrine) process.env.VITE_VITRINE = '1';
  else delete process.env.VITE_VITRINE;
  try {
    await build({
      root: WEB,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
  } finally {
    if (anterior === undefined) delete process.env.VITE_VITRINE;
    else process.env.VITE_VITRINE = anterior;
  }
  const assets = join(outDir, 'assets');
  return readdirSync(assets)
    .filter((n) => n.endsWith('.js') || n.endsWith('.css'))
    .map((n) => readFileSync(join(assets, n), 'utf8'))
    .join('\n');
}

afterAll(() => {
  for (const p of pastas) rmSync(p, { recursive: true, force: true });
});

describe('build e a vitrine', () => {
  it('FUN-38: o build de produção não contém as rotas de vitrine', async () => {
    const saida = await construir(false);
    expect(saida).not.toContain('_vitrine');
    expect(saida).not.toContain('carregando-lista');
  }, 60_000);

  it('FUN-38: o build com VITE_VITRINE=1 contém (a busca do teste anterior enxerga a vitrine)', async () => {
    const saida = await construir(true);
    expect(saida).toContain('_vitrine');
  }, 60_000);
});
