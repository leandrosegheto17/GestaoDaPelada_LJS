import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASTA_MIGRACOES } from '@pelada/api/migrar';
import { executarCli } from './conectar.ts';

/** Última migração herdada (AD-003): toda migração nova tem timestamp maior. */
export const ULTIMA_HERDADA = 1792844520000;

export interface OpcoesMigracaoNova {
  pasta?: string;
  /** Relógio; padrão `Date.now()`. Os testes fixam o instante. */
  agora?: () => number;
}

/** Minúsculas, sem acento, só letras, números e hifens. */
export function normalizarNome(nome: string): string {
  const n = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (n === '') throw new Error('Nome da migração vazio. Uso: pnpm migracao:nova <nome>');
  return n;
}

function ultimoTimestamp(pasta: string): number {
  const existentes = readdirSync(pasta)
    .map((f) => /^(\d+)_.*\.sql$/.exec(f)?.[1])
    .filter((t): t is string => t !== undefined)
    .map(Number);
  return Math.max(ULTIMA_HERDADA, ...existentes);
}

/**
 * `pnpm migracao:nova <nome>` (FUN-07): cria `<timestamp>_<nome>.sql` com o cabeçalho
 * `-- Up Migration`. O timestamp é o maior entre o relógio e o último existente + 1, e a
 * criação exclusiva (`wx`) faz dois geradores no mesmo milissegundo não colidirem.
 */
export function criarMigracao(nome: string, opcoes: OpcoesMigracaoNova = {}): string {
  const pasta = opcoes.pasta ?? PASTA_MIGRACOES;
  const sufixo = normalizarNome(nome);
  let ts = Math.max((opcoes.agora ?? Date.now)(), ultimoTimestamp(pasta) + 1);
  for (;;) {
    const arquivo = `${ts}_${sufixo}.sql`;
    try {
      writeFileSync(join(pasta, arquivo), `-- Up Migration\n-- ${sufixo}\n`, { flag: 'wx' });
      return arquivo;
    } catch (erro) {
      if ((erro as { code?: string }).code !== 'EEXIST') throw erro;
      ts = Math.max(ts + 1, ultimoTimestamp(pasta) + 1);
    }
  }
}

if (import.meta.main) {
  await executarCli(async () => {
    const nome = process.argv.slice(2).join(' ');
    console.log(`Criada: ${criarMigracao(nome)}`);
  });
}
