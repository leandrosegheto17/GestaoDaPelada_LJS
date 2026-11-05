import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarMigracao, normalizarNome, ULTIMA_HERDADA } from '../src/migracao-nova.ts';

let pasta: string;
const ts = (arquivo: string) => Number(arquivo.split('_')[0]);

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'pelada-migracao-nova-'));
  writeFileSync(
    join(pasta, `${ULTIMA_HERDADA}_grupos-arquivar-so-criadora.sql`),
    '-- Up Migration\n',
  );
});

afterEach(() => rmSync(pasta, { recursive: true, force: true }));

describe('pnpm migracao:nova', () => {
  it('FUN-07: o timestamp é maior que 1792844520000 mesmo com o relógio atrasado', () => {
    const arquivo = criarMigracao('nova tabela', { pasta, agora: () => 1_000 });
    expect(ts(arquivo)).toBeGreaterThan(1792844520000);
  });

  it('FUN-07: o timestamp é maior que o do último arquivo existente', () => {
    writeFileSync(join(pasta, '1800000000000_futura.sql'), '-- Up Migration\n');
    const arquivo = criarMigracao('depois', { pasta, agora: () => 1792844600000 });
    expect(ts(arquivo)).toBeGreaterThan(1800000000000);
  });

  it('FUN-07: com o relógio à frente, usa o relógio', () => {
    expect(ts(criarMigracao('x', { pasta, agora: () => 1900000000000 }))).toBe(1900000000000);
  });

  it('FUN-07: o nome é normalizado em minúsculas e hifens', () => {
    const arquivo = criarMigracao('  Presença dos Jogadores_v2! ', {
      pasta,
      agora: () => 1900000000000,
    });
    expect(arquivo).toBe('1900000000000_presenca-dos-jogadores-v2.sql');
    expect(normalizarNome('Ação__Rápida')).toBe('acao-rapida');
  });

  it('FUN-07: o arquivo nasce com o cabeçalho -- Up Migration', () => {
    const arquivo = criarMigracao('cabecalho', { pasta, agora: () => 1900000000000 });
    expect(readFileSync(join(pasta, arquivo), 'utf8').startsWith('-- Up Migration\n')).toBe(true);
  });

  it('FUN-07: nome vazio é recusado', () => {
    expect(() => criarMigracao(' !! ', { pasta })).toThrow(/vazio/);
  });

  it('FUN-07: dois geradores no mesmo milissegundo não colidem', () => {
    const agora = () => 1900000000000;
    const a = criarMigracao('mesma', { pasta, agora });
    const b = criarMigracao('mesma', { pasta, agora });
    expect(a).not.toBe(b);
    expect(ts(b)).toBeGreaterThan(ts(a));
    expect(readdirSync(pasta).filter((f) => f.endsWith('_mesma.sql'))).toHaveLength(2);
  });
});
