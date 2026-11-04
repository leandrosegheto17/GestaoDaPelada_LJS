import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { comBancoDeTeste } from '../../api/test/apoio/banco.ts';
import { restaurarBackup } from '../ops/restaurar-backup.ts';

/** Cria chave age, dump cifrado do banco (pg_dump 18 do container) e devolve os caminhos. */
function dumpCifrado(urlOrigem: string) {
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-restaurar-'));
  const chave = join(pasta, 'chave.txt');
  execFileSync('age-keygen', ['-o', chave], { stdio: 'pipe' });
  const publica = execFileSync('age-keygen', ['-y', chave], { encoding: 'utf8' }).trim();
  const banco = new URL(urlOrigem).pathname.slice(1);
  const dump = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-Fc', '-U', 'postgres', '-d', banco],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const bruto = join(pasta, 'b.dump');
  writeFileSync(bruto, dump);
  const arquivo = join(pasta, 'b.dump.age');
  execFileSync('age', ['-r', publica, '-o', arquivo, bruto]);
  return { pasta, chave, arquivo };
}

async function popular(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('create table grupo (id int primary key, nome text)');
  await c.query('create table jogador (id int primary key, grupo_id int references grupo(id))');
  await c.query("insert into grupo values (1, 'a'), (2, 'b')");
  await c.query('insert into jogador values (1, 1), (2, 1), (3, 2)');
  await c.end();
}

describe('restaurar backup', () => {
  test('FUN-50: restaura num banco vazio com contagem de linhas igual por tabela', async () => {
    await comBancoDeTeste(async (origem) => {
      await popular(origem);
      const { pasta, chave, arquivo } = dumpCifrado(origem);
      try {
        await comBancoDeTeste(async (destino) => {
          const contagem = await restaurarBackup({ arquivo, chave, urlDestino: destino });
          expect(contagem).toEqual({ grupo: 2, jogador: 3 });
        });
      } finally {
        rmSync(pasta, { recursive: true, force: true });
      }
    });
  }, 120_000);

  test('FUN-50: recusa restaurar num host fora da lista de permitidos', async () => {
    await expect(
      restaurarBackup({
        arquivo: 'nao-importa.age',
        chave: 'nao-importa.txt',
        urlDestino: 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/db',
      }),
    ).rejects.toThrow(/não permitido/);
  });

  test('FUN-50: recusa restaurar num banco que já tem tabelas', async () => {
    await comBancoDeTeste(async (origem) => {
      await popular(origem);
      const { pasta, chave, arquivo } = dumpCifrado(origem);
      try {
        await expect(restaurarBackup({ arquivo, chave, urlDestino: origem })).rejects.toThrow(
          /já tem tabelas/,
        );
      } finally {
        rmSync(pasta, { recursive: true, force: true });
      }
    });
  }, 120_000);
});
