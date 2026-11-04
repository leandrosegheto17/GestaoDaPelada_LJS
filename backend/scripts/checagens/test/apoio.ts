import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';

const pastas: string[] = [];

/** Cria um repositório de mentira numa pasta temporária; as pastas são apagadas ao fim de cada teste. */
export function repo(arquivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'pelada-checagem-'));
  pastas.push(raiz);
  for (const [caminho, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, caminho)), { recursive: true });
    writeFileSync(join(raiz, caminho), texto);
  }
  return raiz;
}

afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
