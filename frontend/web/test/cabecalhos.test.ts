import react from '@vitejs/plugin-react';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { ajustarCspAoSentry, cabecalhosDeSeguranca, origemDoDsn } from '../config/cabecalhos.ts';

const RAIZ = join(import.meta.dirname, '..');
// O repositório grava LF, mas no Windows a cópia de trabalho pode vir com CRLF.
const fonte = readFileSync(join(RAIZ, 'public/_headers'), 'utf8').replaceAll('\r\n', '\n');
const DSN = 'https://chave@o123.ingest.sentry.io/456';

const linha = (texto: string, nome: string) => new RegExp(`^\\s*${nome}:.*$`, 'm').exec(texto)?.[0] ?? '';

// FUN-28
describe('public/_headers (fonte)', () => {
  it.each(['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security'])(
    'traz o cabeçalho %s',
    (nome) => {
      expect(linha(fonte, nome)).not.toBe('');
    },
  );

  it('a CSP só permite a própria origem em connect-src e não usa unsafe-', () => {
    const csp = linha(fonte, 'Content-Security-Policy');
    expect(csp).toMatch(/connect-src 'self';/);
    expect(csp).not.toContain('unsafe-');
  });
});

// FUN-23, FUN-24: a CSP só muda com DSN.
describe('ajustarCspAoSentry', () => {
  it('sem DSN devolve o texto igual', () => {
    expect(ajustarCspAoSentry(fonte, undefined)).toBe(fonte);
    expect(ajustarCspAoSentry(fonte, '')).toBe(fonte);
  });

  it('com DSN acrescenta só a origem do Sentry ao connect-src', () => {
    const ajustado = ajustarCspAoSentry(fonte, DSN);
    expect(linha(ajustado, 'Content-Security-Policy')).toContain("connect-src 'self' https://o123.ingest.sentry.io;");
    expect(ajustado.replace(' https://o123.ingest.sentry.io', '')).toBe(fonte);
  });

  it('DSN malformado é erro', () => {
    expect(() => origemDoDsn('isto não é uma url')).toThrow(/VITE_SENTRY_DSN/);
  });
});

describe('plugin no build', () => {
  const pastas: string[] = [];
  afterEach(() => {
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });

  async function headersDoBuild(dsn: string | undefined): Promise<string> {
    const saida = mkdtempSync(join(tmpdir(), 'headers-'));
    pastas.push(saida);
    await build({
      root: RAIZ,
      configFile: false,
      logLevel: 'silent',
      plugins: [react(), cabecalhosDeSeguranca(dsn)],
      build: { outDir: saida, emptyOutDir: true },
    });
    return readFileSync(join(saida, '_headers'), 'utf8').replaceAll('\r\n', '\n');
  }

  it('sem DSN, o dist/_headers é igual ao da fonte', async () => {
    expect(await headersDoBuild(undefined)).toBe(fonte);
  }, 60000);

  it('com DSN, o dist/_headers libera o Sentry no connect-src', async () => {
    expect(await headersDoBuild(DSN)).toContain("connect-src 'self' https://o123.ingest.sentry.io;");
  }, 60000);
});
