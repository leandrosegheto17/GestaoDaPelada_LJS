import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, test } from 'vitest';
import { manifesto } from '../src/config/manifesto.ts';

const WEB = join(import.meta.dirname, '..');
const outDir = mkdtempSync(join(tmpdir(), 'pelada-pwa-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('build do PWA', () => {
  test('FUN-33, FUN-34, FUN-35: gera manifest, sw e offline.html com o precache', async () => {
    await build({
      root: WEB,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
    const gerado = JSON.parse(
      readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8'),
    ) as typeof manifesto;
    expect(gerado.name).toBe(manifesto.name);
    expect(gerado.display).toBe(manifesto.display);
    expect(gerado.lang).toBe(manifesto.lang);
    expect(gerado.start_url).toBe(manifesto.start_url);
    expect(gerado.theme_color).toBe(manifesto.theme_color);
    expect(gerado.icons.map((i) => i.src).sort()).toEqual(manifesto.icons.map((i) => i.src).sort());
    expect(existsSync(join(outDir, 'offline.html'))).toBe(true);
    const sw = readFileSync(join(outDir, 'sw.js'), 'utf8');
    expect(sw).toContain('offline.html');
    expect(sw).toContain('index.html');
    expect(sw).toContain('notificationclick');
  }, 120_000);
});
