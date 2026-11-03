import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { verificarMigracoes } from '../migracao-aditiva.ts';

const oficial = resolve(import.meta.dirname, '../../../api/src/infraestrutura/db/migracoes');
const temporarias: string[] = [];
afterAll(() => temporarias.forEach((p) => rmSync(p, { recursive: true, force: true })));

let dir = '';
let estado = '';
beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), 'aditiva-'));
  temporarias.push(dir);
  estado = resolve(dir, 'STATE.md');
  writeFileSync(estado, '- **AD-021** (2026-11-03): exceção de exemplo.\n');
});

const nova = (sql: string, nome = '1792844600000_nova.sql') =>
  writeFileSync(resolve(dir, nome), `-- Up Migration\n${sql}\n`);
const rodar = (hashes: Record<string, string> = {}) =>
  verificarMigracoes({ dir, estado, hashesHerdados: hashes });

test.each([
  ['DROP TABLE', 'drop table grupos;'],
  ['DROP COLUMN', 'alter table grupos drop column nome;'],
  ['ALTER ... TYPE', 'alter table grupos alter column nome type varchar(10);'],
  ['ALTER ... SET DATA TYPE', 'alter table grupos alter column nome set data type text;'],
  ['RENAME de coluna', 'alter table grupos rename column nome to titulo;'],
  ['RENAME de tabela', 'alter table grupos rename to times;'],
])('FUN-56: %s reprova numa migração de exemplo', (_n, sql) => {
  nova(sql);
  const r = rodar();
  expect(r).toHaveLength(1);
  expect(r[0]!.arquivo).toBe('1792844600000_nova.sql');
});

test('FUN-56: comandos aditivos passam, e destrutivo em comentário, texto ou seção Down é ignorado', () => {
  writeFileSync(
    resolve(dir, '1792844600000_ok.sql'),
    [
      '-- Up Migration',
      '-- drop table coisa;  (comentário)',
      '/* drop column x */',
      'create table novo (id int);',
      "insert into novo values (1); select 'drop table x';",
      'alter table novo add column y int;',
      "alter type estado add value if not exists 'z';",
      '-- Down Migration',
      'drop table novo;',
    ].join('\n'),
  );
  expect(rodar()).toEqual([]);
});

test('FUN-56: com a linha de exceção e uma AD existente em STATE.md, passa', () => {
  nova('-- excecao-aditiva: AD-021\ndrop table grupos;');
  expect(rodar()).toEqual([]);
});

test('FUN-56: a exceção com AD que não existe em STATE.md reprova', () => {
  nova('-- excecao-aditiva: AD-999\ndrop table grupos;');
  const r = rodar();
  expect(r).toHaveLength(1);
  expect(r[0]!.motivo).toMatch(/AD-999/);
});

test('FUN-56: as 23 copiadas passam pela lista fechada; um 24º arquivo com DROP reprova', () => {
  const hashes: Record<string, string> = {};
  for (const l of readFileSyncLinhas()) hashes[l.nome] = l.hash;
  for (const n of readdirSync(oficial).filter((f) => f.endsWith('.sql')))
    copyFileSync(resolve(oficial, n), resolve(dir, n));
  expect(Object.keys(hashes)).toHaveLength(23);
  expect(rodar(hashes)).toEqual([]);
  nova('drop table grupos;', '1792844600000_vigésima-quarta.sql');
  const r = rodar(hashes);
  expect(r.map((v) => v.arquivo)).toEqual(['1792844600000_vigésima-quarta.sql']);
});

test('FUN-56: migração herdada alterada (hash diferente da lista fechada) reprova', () => {
  const hashes: Record<string, string> = {};
  for (const l of readFileSyncLinhas()) hashes[l.nome] = l.hash;
  for (const n of readdirSync(oficial).filter((f) => f.endsWith('.sql')))
    copyFileSync(resolve(oficial, n), resolve(dir, n));
  const alvo = Object.keys(hashes)[0]!;
  writeFileSync(resolve(dir, alvo), '-- Up Migration\nselect 1;\n');
  const r = rodar(hashes);
  expect(r).toHaveLength(1);
  expect(r[0]!.motivo).toMatch(/herdada/i);
});

function readFileSyncLinhas(): { hash: string; nome: string }[] {
  return readFileSync(resolve(oficial, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, nome] = l.split(/\s+/);
      return { hash: hash!, nome: nome! };
    });
}
