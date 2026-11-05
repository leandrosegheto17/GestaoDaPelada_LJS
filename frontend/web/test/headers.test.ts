// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CABECALHOS_DOS_ASSETS, diretivasCsp, fontesDeScript } from './apoio/cabecalhos.ts';

/**
 * `public/_headers` (FUN-29): CSP sem script embutido nem eval, `nosniff`, `Referrer-Policy` e
 * HSTS em todos os assets. O build copia o arquivo de `public` para o `dist` sem alterar.
 */

const ARQUIVO = readFileSync(join(import.meta.dirname, '..', 'public', '_headers'), 'utf8');

/**
 * Lê o formato `_headers` da Cloudflare: uma linha de caminho sem recuo, seguida das linhas
 * `Nome: valor` recuadas. Comentários começam com `#`.
 */
function lerHeaders(texto: string): Map<string, Map<string, string>> {
  const blocos = new Map<string, Map<string, string>>();
  let atual: Map<string, string> | undefined;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.trim() === '' || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) {
      atual = new Map();
      blocos.set(linha.trim(), atual);
      continue;
    }
    const i = linha.indexOf(':');
    if (!atual || i < 0) throw new Error(`Linha fora de um bloco ou sem ':': ${linha}`);
    atual.set(linha.slice(0, i).trim().toLowerCase(), linha.slice(i + 1).trim());
  }
  return blocos;
}

const todos = lerHeaders(ARQUIVO).get('/*');

describe('public/_headers', () => {
  it('FUN-29: tem um bloco para todos os caminhos (/*)', () => {
    expect(todos).toBeDefined();
  });

  for (const [nome, valor] of Object.entries(CABECALHOS_DOS_ASSETS)) {
    it(`FUN-29: ${nome} presente com o valor esperado`, () => {
      expect(todos?.get(nome)).toBe(valor);
    });
  }

  it("FUN-29: a CSP não aceita 'unsafe-inline' nem 'unsafe-eval' para script", () => {
    const csp = todos?.get('content-security-policy') ?? '';
    const fontes = fontesDeScript(csp).map((f) => f.toLowerCase());
    expect(fontes.length).toBeGreaterThan(0);
    expect(fontes).not.toContain("'unsafe-inline'");
    expect(fontes).not.toContain("'unsafe-eval'");
    expect(csp.toLowerCase()).not.toContain('unsafe-eval');
  });

  it("FUN-29: a CSP tem default-src 'self' e não aceita frame de outra origem", () => {
    const d = diretivasCsp(todos?.get('content-security-policy') ?? '');
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
  });

  it("FUN-29: a leitura da CSP pega 'unsafe-inline' em script-src (o teste reprova a CSP fraca)", () => {
    expect(fontesDeScript("default-src 'self'; script-src 'self' 'unsafe-inline'")).toContain(
      "'unsafe-inline'",
    );
    expect(fontesDeScript("default-src 'self' 'unsafe-eval'")).toContain("'unsafe-eval'");
  });
});
