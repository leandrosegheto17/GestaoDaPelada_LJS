import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', '..', 'src', 'infraestrutura', 'db', 'migracoes');

/** Hash de cada uma das 23 migrações, calculado na origem (LJS @ e557292), R1 do reuso.md. */
function referencia(): Map<string, string> {
  const linhas = readFileSync(join(DIR, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  return new Map(
    linhas.map((l) => {
      const [hash, nome] = l.split(/\s+/);
      return [nome ?? '', hash ?? ''];
    }),
  );
}

const HERDADAS = [...referencia().keys()];

describe('migrações herdadas', () => {
  it('FUN-08: o arquivo de referência lista exatamente 23 migrações', () => {
    expect(HERDADAS).toHaveLength(23);
    expect(HERDADAS[0]).toBe('1792843200000_linha-de-base.sql');
    expect(HERDADAS[22]).toBe('1792844520000_grupos-arquivar-so-criadora.sql');
  });

  it('FUN-08: cada migração herdada tem o SHA-256 da origem, byte a byte', () => {
    for (const [nome, hash] of referencia()) {
      const atual = createHash('sha256')
        .update(readFileSync(join(DIR, nome)))
        .digest('hex');
      expect(atual, nome).toBe(hash);
    }
  });

  it('FUN-09: as herdadas são os 23 primeiros .sql, na ordem do nome', () => {
    const sql = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(sql.slice(0, 23)).toEqual([...HERDADAS].sort());
    expect(HERDADAS).toEqual([...HERDADAS].sort());
  });

  // As features criaram migrações novas (mudança de teste autorizada, mesma força): as 23 herdadas continuam
  // todas lá, e toda extra tem timestamp maior que o da última herdada.
  it('FUN-08: as 23 herdadas continuam todas na pasta e toda migração extra vem depois da última delas', () => {
    const sql = readdirSync(DIR).filter((f) => f.endsWith('.sql'));
    expect(HERDADAS.filter((h) => !sql.includes(h))).toEqual([]);
    const ultima = [...HERDADAS].sort().at(-1) as string;
    expect(sql.filter((f) => !HERDADAS.includes(f) && f <= ultima)).toEqual([]);
  });
});
