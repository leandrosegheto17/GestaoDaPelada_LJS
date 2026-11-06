import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lerEsquema,
  lerReferencia,
  OPCOES_REFERENCIA,
} from '../../src/infraestrutura/db/esquema.ts';
import { PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

const referencia = lerReferencia();

/** Funções criadas com SECURITY DEFINER nas migrações herdadas, lidas do próprio SQL. */
function definersNoSql(): string[] {
  const nomes = new Set<string>();
  for (const arquivo of readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(PASTA_MIGRACOES, arquivo), 'utf8');
    const cabecalhos = sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\bAS\s+\$/gi,
    );
    for (const m of cabecalhos) {
      if (/SECURITY\s+DEFINER/i.test(m[2] ?? '')) nomes.add(m[1] ?? '');
    }
  }
  return [...nomes].sort();
}

describe('esquema-producao.txt', () => {
  it('FUN-08: banco vazio migrado tem a impressão digital igual à referência versionada', async () => {
    await bancoDeTeste(
      async (url) => {
        const atual = await comCliente(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
        expect(atual).toEqual(referencia);
      },
      { migrado: true },
    );
  });

  it('FUN-08: a referência cobre as tabelas com FORCE (as 25 herdadas e as das features)', () => {
    const comRls = referencia.filter((l) => l.startsWith('rls '));
    const forcadas = referencia.filter((l) => /^rls \S+ enable=true force=true$/.test(l));
    // Toda tabela com RLS na referência a tem forçada, e nenhuma das 25 herdadas deixou de estar lá.
    expect(forcadas).toEqual(comRls);
    expect(forcadas.length).toBeGreaterThanOrEqual(25);
  });

  it('FUN-08: a referência cobre toda função SECURITY DEFINER herdada', () => {
    const esperadas = definersNoSql();
    expect(esperadas.length).toBeGreaterThan(0);
    const definers = referencia
      .filter((l) => l.startsWith('funcao ') && l.includes(' security definer '))
      .map((l) => l.slice('funcao '.length, l.indexOf('(')));
    expect([...new Set(definers)].sort()).toEqual(esperadas);
  });

  it('FUN-08: a referência traz as roles herdadas e nenhuma senha', () => {
    expect(referencia.some((l) => l.startsWith('role pelada_app '))).toBe(true);
    expect(referencia.some((l) => l.startsWith('role pelada_backup_ro '))).toBe(true);
    expect(referencia.join('\n')).not.toMatch(/SCRAM-SHA-256|md5[0-9a-f]{32}/);
  });
});
