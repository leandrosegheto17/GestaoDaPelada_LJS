import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..');
const MOCKUP = join(RAIZ, '../../.specs/mockup');

// O .gitattributes grava LF no repositório, mas no Windows a cópia de trabalho pode vir com CRLF:
// texto compara sem a diferença de fim de linha; binário (woff2) compara byte a byte.
const TEXTO = /\.(css|txt)$/;
const lf = (b: Buffer) => b.toString('utf8').replaceAll('\r\n', '\n');
function igual(a: Buffer, b: Buffer, nome: string): boolean {
  return TEXTO.test(nome) ? lf(a) === lf(b) : a.equals(b);
}

// Legado: frontend/web/test/estilos.test.ts. Critério: FUN-29 (aparência = mockup, byte a byte).
describe('aparência = mockup (FUN-29)', () => {
  it('tokens.css é cópia byte a byte do mockup', () => {
    const app = readFileSync(join(RAIZ, 'src/estilos/tokens.css'));
    const mockup = readFileSync(join(MOCKUP, 'tokens.css'));
    expect(igual(app, mockup, 'tokens.css')).toBe(true);
  });

  it('as fontes de public/fontes são as do mockup, byte a byte, sem sobra nem falta', () => {
    const doMockup = readdirSync(join(MOCKUP, 'fontes'))
      .filter((n) => n !== 'baixar-fontes.mjs')
      .sort();
    const doApp = readdirSync(join(RAIZ, 'public/fontes'), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
    expect(doApp).toEqual(doMockup);
    for (const nome of doMockup) {
      const a = readFileSync(join(RAIZ, 'public/fontes', nome));
      const b = readFileSync(join(MOCKUP, 'fontes', nome));
      expect(igual(a, b, nome), nome).toBe(true);
    }
  });
});

describe('index.html (FUN-29)', () => {
  it('não tem script nem estilo inline nem recurso de terceiro', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/<style/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
