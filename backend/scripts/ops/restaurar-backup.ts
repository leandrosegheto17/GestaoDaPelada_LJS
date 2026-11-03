import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, comSaida } from '../src/conectar.ts';
import { exigirHostPermitido } from '../src/host.ts';

/*
 * Restaura um backup cifrado (.age) num banco local vazio (FUN-50).
 * A decifragem e o pg_restore 18 rodam num container (imagem pelada-dump-teste: postgres:18 + age),
 * então a máquina não precisa de age nem de pg_restore na versão certa. A chave privada é um arquivo local.
 */
const raiz = resolve(import.meta.dirname, '../../..');
const IMAGEM = 'pelada-dump-teste';

export interface OpcoesRestauracao {
  arquivo: string;
  chavePrivada: string;
  url: string;
}

/** Contagem exata de linhas por tabela do schema public, ordenada por nome. */
export async function contarLinhas(url: string): Promise<Record<string, number>> {
  const cliente = await conectar(url);
  try {
    const { rows } = await cliente.query<{ nome: string }>(
      "select tablename as nome from pg_tables where schemaname = 'public' order by tablename",
    );
    const contagem: Record<string, number> = {};
    for (const { nome } of rows) {
      const r = await cliente.query<{ n: number }>(
        `select count(*)::int as n from ${cliente.escapeIdentifier(nome)}`,
      );
      contagem[nome] = r.rows[0]!.n;
    }
    return contagem;
  } finally {
    await cliente.end();
  }
}

/** Roles que os dumps citam em policies e grants; o pg_restore roda com --no-owner --no-acl e não as cria. */
const ROLES_DO_APP = ['pelada_app', 'pelada_backup_ro', 'pelada_owner'];

async function garantirRoles(url: string): Promise<void> {
  const cliente = await conectar(url);
  try {
    for (const role of ROLES_DO_APP) {
      const { rowCount } = await cliente.query('select 1 from pg_roles where rolname = $1', [role]);
      if (rowCount === 0)
        await cliente.query(`create role ${cliente.escapeIdentifier(role)} nologin`);
    }
  } finally {
    await cliente.end();
  }
}

function docker(args: string[], timeout: number) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout });
}

export async function restaurarBackup(opcoes: OpcoesRestauracao): Promise<Record<string, number>> {
  exigirHostPermitido(opcoes.url);
  for (const caminho of [opcoes.arquivo, opcoes.chavePrivada]) {
    if (!existsSync(caminho)) throw new Error(`Arquivo não encontrado: ${caminho}`);
  }

  const existentes = await contarLinhas(opcoes.url);
  if (Object.keys(existentes).length > 0) {
    throw new Error('O banco de destino já tem tabelas: restaure só num banco vazio');
  }

  await garantirRoles(opcoes.url);

  const imagem = docker(
    [
      'build',
      '-q',
      '-t',
      IMAGEM,
      '-f',
      resolve(raiz, '.github/actions/dump-cifrado/teste.Dockerfile'),
      resolve(raiz, '.github/actions/dump-cifrado'),
    ],
    280_000,
  );
  if (imagem.status !== 0) throw new Error(`Não foi possível preparar a imagem: ${imagem.stderr}`);

  const urlNoContainer = opcoes.url.replace(
    /@(127\.0\.0\.1|localhost)([:/])/,
    '@host.docker.internal$2',
  );
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-e',
      'RESTAURAR_URL',
      '-v',
      `${resolve(opcoes.arquivo)}:/in/backup.age:ro`,
      '-v',
      `${resolve(opcoes.chavePrivada)}:/in/chave.txt:ro`,
      IMAGEM,
      'bash',
      '-c',
      'set -euo pipefail; age -d -i /in/chave.txt /in/backup.age | pg_restore --no-owner --no-acl --exit-on-error -d "$RESTAURAR_URL"',
    ],
    { encoding: 'utf8', timeout: 600_000, env: { ...process.env, RESTAURAR_URL: urlNoContainer } },
  );
  if (r.status !== 0) {
    // O stderr do pg_restore não traz a URL; mesmo assim, nada de credencial na mensagem.
    throw new Error(
      `Falha na restauração (código ${r.status}): ${r.stderr.split(urlNoContainer).join('***')}`,
    );
  }
  return contarLinhas(opcoes.url);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [arquivo, chavePrivada] = process.argv.slice(2);
  const codigo = await comSaida(async () => {
    if (!arquivo || !chavePrivada)
      throw new Error('Uso: pnpm restaurar <backup.age> <chave-privada.txt>');
    const url =
      process.env.DATABASE_URL_RESTAURACAO ??
      'postgres://postgres:postgres@127.0.0.1:5432/restauracao';
    const contagem = await restaurarBackup({ arquivo, chavePrivada, url });
    for (const [tabela, n] of Object.entries(contagem)) console.log(`${tabela}: ${n}`);
  });
  process.exitCode = codigo;
}
