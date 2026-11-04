import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const bruto = readFileSync(join(import.meta.dirname, '..', 'public', '_headers'), 'utf8');

/** Lê o formato do Cloudflare: uma regra de caminho e, abaixo, cabeçalhos indentados. */
function cabecalhosDe(caminho: string): Map<string, string> {
  const linhas = bruto.split(/\r?\n/);
  const inicio = linhas.findIndex((l) => l.trim() === caminho);
  if (inicio < 0) throw new Error(`regra ${caminho} ausente em _headers`);
  const cabecalhos = new Map<string, string>();
  for (const linha of linhas.slice(inicio + 1)) {
    if (!/^\s+\S/.test(linha)) break;
    const [nome, ...resto] = linha.trim().split(':');
    cabecalhos.set((nome ?? '').trim().toLowerCase(), resto.join(':').trim());
  }
  return cabecalhos;
}

describe('_headers dos arquivos estáticos', () => {
  const todos = () => cabecalhosDe('/*');

  test('FUN-29: cada cabeçalho de segurança presente com o valor esperado', () => {
    const h = todos();
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(h.get('content-security-policy')).toBeTruthy();
  });

  test('FUN-29: a CSP parte de default-src self e não afrouxa o script', () => {
    const csp = todos().get('content-security-policy') ?? '';
    const diretivas = new Map(
      csp.split(';').map((d) => {
        const [nome, ...valores] = d.trim().split(/\s+/);
        return [nome, valores] as const;
      }),
    );
    expect(diretivas.get('default-src')).toEqual(["'self'"]);
    expect(diretivas.get('script-src')).toEqual(["'self'"]);
    expect(diretivas.get('object-src')).toEqual(["'none'"]);
    expect(diretivas.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-eval/);
    const script = (diretivas.get('script-src') ?? []).concat(diretivas.get('default-src') ?? []);
    expect(script).not.toContain("'unsafe-inline'");
  });
});
