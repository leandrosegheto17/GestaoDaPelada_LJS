import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARQUIVO_REFERENCIA, lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { comConexao, executarCli } from './conectar.ts';
import { exigirHostPermitido, HOSTS_TESTE } from './host.ts';

/** As 23 migrações herdadas, na ordem, lidas do migracoes.sha256 (R1 do reuso.md). */
export function migracoesHerdadas(): string[] {
  return readFileSync(join(PASTA_MIGRACOES, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[1])
    .filter((n): n is string => Boolean(n));
}

/**
 * `pnpm esquema:gerar` (FUN-08): cria um banco vazio descartável, migra só com as 23
 * herdadas e grava a impressão digital em `migracoes/esquema-producao.txt`.
 */
export async function gerarReferencia(urlBase: string): Promise<string[]> {
  exigirHostPermitido(urlBase, HOSTS_TESTE);
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  const pasta = mkdtempSync(join(tmpdir(), 'pelada-herdadas-'));
  await comConexao(urlBase, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    for (const arquivo of migracoesHerdadas()) {
      copyFileSync(join(PASTA_MIGRACOES, arquivo), join(pasta, arquivo));
    }
    const u = new URL(urlBase);
    u.pathname = `/${nome}`;
    await migrar(u.toString(), { pasta });
    const linhas = await comConexao(u.toString(), (c) => lerEsquema(c, OPCOES_REFERENCIA));
    writeFileSync(ARQUIVO_REFERENCIA, `${linhas.join('\n')}\n`);
    return linhas;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
    await comConexao(urlBase, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

if (import.meta.main) {
  await executarCli(async () => {
    const url =
      process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
    const linhas = await gerarReferencia(url);
    console.log(`esquema-producao.txt gravado com ${linhas.length} linhas.`);
  });
}
