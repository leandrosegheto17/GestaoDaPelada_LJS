import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checarMigracaoAditiva } from '../migracao-aditiva.ts';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function montar(arquivos: Record<string, string>, fechados: string[] = []) {
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-aditiva-'));
  pastas.push(pasta);
  for (const [n, sql] of Object.entries(arquivos)) writeFileSync(join(pasta, n), sql);
  const hash = (n: string) => createHash('sha256').update(arquivos[n]!).digest('hex');
  writeFileSync(
    join(pasta, 'migracoes.sha256'),
    fechados.map((n) => `${hash(n)}  ${n}`).join('\n') + '\n',
  );
  const state = join(pasta, 'STATE.md');
  writeFileSync(state, '- **AD-099** (2026-11-04): exceção de exemplo.\n');
  return { pasta, state };
}

const NOVA = '9000_nova.sql';

describe('migração aditiva', () => {
  test.each([
    ['DROP TABLE', 'drop table x;'],
    ['DROP COLUMN', 'alter table x drop column y;'],
    ['ALTER ... TYPE', 'alter table x alter column y type bigint;'],
    ['ALTER ... SET DATA TYPE', 'alter table x alter column y set data type bigint;'],
    ['RENAME de tabela', 'alter table x rename to z;'],
    ['RENAME de coluna', 'alter table x rename column a to b;'],
  ])('FUN-56: %s reprova numa migração de exemplo', (_n, sql) => {
    const { pasta, state } = montar({ [NOVA]: `-- Up Migration\n${sql}\n` });
    const r = checarMigracaoAditiva({ pasta, state });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toContain(NOVA);
  });

  test('FUN-56: migração só aditiva passa; comando destrutivo em comentário é ignorado', () => {
    const { pasta, state } = montar({
      [NOVA]: '-- drop table antiga;\ncreate table n (x int);\nalter table n add column y int;\n',
    });
    expect(checarMigracaoAditiva({ pasta, state })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-56: com a linha de exceção e uma AD existente em STATE.md, passa', () => {
    const { pasta, state } = montar({
      [NOVA]: '-- excecao-aditiva: AD-099\ndrop table x;\n',
    });
    expect(checarMigracaoAditiva({ pasta, state }).ok).toBe(true);
  });

  test('FUN-56: exceção que cita AD inexistente reprova', () => {
    const { pasta, state } = montar({
      [NOVA]: '-- excecao-aditiva: AD-777\ndrop table x;\n',
    });
    const r = checarMigracaoAditiva({ pasta, state });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toContain('AD-777');
  });

  test('FUN-56: arquivos da lista fechada passam sem leitura; um 24º com DROP reprova', () => {
    const copiada = '1000_antiga.sql';
    const { pasta, state } = montar({ [copiada]: 'drop table velha;', [NOVA]: 'drop table x;' }, [
      copiada,
    ]);
    const r = checarMigracaoAditiva({ pasta, state });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toContain(NOVA);
    expect(r.violacoes.join('\n')).not.toContain(copiada);
  });

  test('FUN-56: arquivo da lista fechada alterado (hash diferente) reprova', () => {
    const copiada = '1000_antiga.sql';
    const { pasta, state } = montar({ [copiada]: 'create table a (x int);' }, [copiada]);
    writeFileSync(join(pasta, copiada), 'create table a (x int); -- editado');
    const r = checarMigracaoAditiva({ pasta, state });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toContain(copiada);
  });
});

describe('as 23 migrações copiadas', () => {
  test('FUN-56: passam pela lista fechada da pasta real', async () => {
    const { checarPastaReal } = await import('../migracao-aditiva.ts');
    expect(checarPastaReal()).toEqual({ ok: true, violacoes: [] });
  });
});
