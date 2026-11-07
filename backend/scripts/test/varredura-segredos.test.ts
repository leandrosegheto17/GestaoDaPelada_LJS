import { describe, expect, it } from 'vitest';
import { textoDo } from './apoio/workflow.ts';

/**
 * Varredura de segredos sem ponto cego (fundacao /validar, A-14, A-17; FUN-46): a allowlist do gitleaks só libera
 * arquivos nomeados (nenhuma pasta inteira) e o `.gitignore` cobre as variantes de `.env` e o `.dev.vars` do wrangler.
 */
describe('A-14: varredura de segredos', () => {
  const toml = textoDo('.gitleaks.toml');
  const trecho = /paths\s*=\s*\[([^\]]*)\]/.exec(toml)?.[1] ?? '';
  const aspas = "'".repeat(3);
  const entradas = trecho
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(aspas))
    .map((l) => l.replace(/,$/, '').slice(3, -3));

  it('A-14: a allowlist de caminhos do gitleaks tem entradas e nenhuma é pasta inteira', () => {
    expect(entradas.length).toBeGreaterThan(0);
    for (const e of entradas) {
      expect(e, `entrada "${e}" parece uma pasta inteira`).not.toMatch(/(\/|\\\/)$/);
    }
  });

  it('A-14: .specs, .claude e .rascunho não estão liberados por pasta', () => {
    for (const e of entradas) {
      expect(e).not.toMatch(/^\\\.(specs|rascunho)/);
      expect(e).not.toBe('\\.claude/');
    }
  });

  it('A-14: o .gitignore cobre .env.*, .dev.vars e mantém o .env.example versionado', () => {
    const gitignore = textoDo('.gitignore').split(/\r?\n/);
    for (const linha of ['.env', '.env.*', '!.env.example', '.dev.vars', '.dev.vars.*']) {
      expect(gitignore, linha).toContain(linha);
    }
  });
});
