import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Origem do Sentry (`https://host`) a partir do DSN; DSN malformado é erro (o build não deve gerar CSP errada). */
export function origemDoDsn(dsn: string): string {
  try {
    return new URL(dsn).origin;
  } catch {
    throw new Error('VITE_SENTRY_DSN não é uma URL válida.');
  }
}

/**
 * Ajusta a CSP do `_headers` ao Sentry (FUN-28, FUN-23): só com DSN a diretiva `connect-src` ganha a origem do Sentry;
 * sem DSN o texto sai igual e o app não fala com terceiros (FUN-24).
 */
export function ajustarCspAoSentry(headers: string, dsn: string | undefined): string {
  if (!dsn) return headers;
  const origem = origemDoDsn(dsn);
  return headers.replace(/(connect-src[^;\n]*)/, `$1 ${origem}`);
}

/** Grava no `dist/_headers` a versão com a CSP ajustada ao Sentry (o arquivo-fonte fica em `public/_headers`). */
export function cabecalhosDeSeguranca(dsn: string | undefined): Plugin {
  let saida = '';
  return {
    name: 'cabecalhos-de-seguranca',
    apply: 'build',
    configResolved: (config) => {
      saida = resolve(config.root, config.build.outDir, '_headers');
    },
    closeBundle: () => {
      writeFileSync(saida, ajustarCspAoSentry(readFileSync(saida, 'utf8'), dsn));
    },
  };
}
