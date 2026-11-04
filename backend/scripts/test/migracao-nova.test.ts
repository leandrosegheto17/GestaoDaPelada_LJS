import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { gerarMigracao, ULTIMA_MIGRACAO_COPIADA } from '../src/migracao-nova.ts';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
const pastaVazia = () => {
  const p = mkdtempSync(join(tmpdir(), 'pelada-nova-'));
  pastas.push(p);
  return p;
};
const timestamp = (arquivo: string) => Number(arquivo.split('_')[0]);

test('FUN-07: o arquivo novo tem timestamp maior que 1792844520000 e que o último existente', () => {
  expect(ULTIMA_MIGRACAO_COPIADA).toBe(1792844520000);
  const pasta = pastaVazia();
  writeFileSync(join(pasta, '1792844520000_ultima.sql'), '');
  writeFileSync(join(pasta, '1999999999999_futura.sql'), '');
  // relógio atrasado: ainda assim vem depois de tudo que existe
  const novo = gerarMigracao({ pasta, nome: 'coisa', agora: 1000 });
  expect(timestamp(novo)).toBeGreaterThan(1999999999999);
  const vazia = pastaVazia();
  expect(timestamp(gerarMigracao({ pasta: vazia, nome: 'x', agora: 1000 }))).toBeGreaterThan(
    ULTIMA_MIGRACAO_COPIADA,
  );
});

test('FUN-07: o nome é normalizado (minúsculas, hifens) e o cabeçalho -- Up Migration é criado', () => {
  const pasta = pastaVazia();
  const novo = gerarMigracao({
    pasta,
    nome: 'Criar Tabela de Jogadores_Ação!',
    agora: 1792844600000,
  });
  expect(novo).toBe('1792844600000_criar-tabela-de-jogadores-acao.sql');
  expect(readFileSync(join(pasta, novo), 'utf8')).toMatch(/^-- Up Migration\n/);
});

test('FUN-07: dois geradores no mesmo milissegundo não colidem', () => {
  const pasta = pastaVazia();
  const a = gerarMigracao({ pasta, nome: 'a', agora: 1792844700000 });
  const b = gerarMigracao({ pasta, nome: 'a', agora: 1792844700000 });
  expect(a).not.toBe(b);
  expect(timestamp(b)).toBeGreaterThan(timestamp(a));
  expect(readdirSync(pasta)).toHaveLength(2);
});

test('FUN-07: nome vazio depois de normalizar é recusado', () => {
  expect(() => gerarMigracao({ pasta: pastaVazia(), nome: '!!!', agora: 1792844700000 })).toThrow(
    /nome/i,
  );
});
