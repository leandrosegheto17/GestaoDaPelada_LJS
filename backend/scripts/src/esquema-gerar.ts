import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ARQUIVO_REFERENCIA, lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar } from '@pelada/api/migrar';
import { comConexao, executarCli } from './conectar.ts';
import { exigirHostPermitido, HOSTS_TESTE } from './host.ts';

/**
 * `pnpm esquema:gerar` (FUN-08): cria um banco vazio descartável, aplica todas as migrações da pasta e grava a
 * impressão digital em `migracoes/esquema-producao.txt`. O teste `esquema.test.ts` exige que um banco vazio migrado
 * tenha exatamente esta impressão: ao entrar migração nova, gere de novo e confira o diff.
 */
export async function gerarReferencia(urlBase: string): Promise<string[]> {
  exigirHostPermitido(urlBase, HOSTS_TESTE);
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(urlBase, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const u = new URL(urlBase);
    u.pathname = `/${nome}`;
    await migrar(u.toString());
    const linhas = await comConexao(u.toString(), (c) => lerEsquema(c, OPCOES_REFERENCIA));
    writeFileSync(ARQUIVO_REFERENCIA, `${linhas.join('\n')}\n`);
    return linhas;
  } finally {
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
