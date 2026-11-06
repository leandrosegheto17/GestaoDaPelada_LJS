import { spawn } from 'node:child_process';
import { comConexao, executarCli } from '../src/conectar.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from '../src/host.ts';

/**
 * Restaura um backup cifrado (FUN-50): decifra com a chave privada guardada fora do GitHub,
 * restaura com pg_restore num banco local vazio e devolve a contagem de linhas por tabela.
 *
 * Por padrão, o `age` é o do sistema e o `pg_restore` roda dentro do container do
 * docker compose, que alcança o mesmo banco por 127.0.0.1:5432.
 */
export interface OpcoesRestaurar {
  /** Arquivo `.age`, como o comando `age` o enxerga. */
  arquivo: string;
  /** Arquivo da chave privada age, como o comando `age` o enxerga. */
  chavePrivada: string;
  /** Banco de destino, visto daqui (trava de host, banco vazio, contagem). */
  urlDestino: string;
  /** Banco de destino, visto pelo pg_restore. Padrão: `urlDestino`. */
  urlPgRestore?: string;
  comandoAge?: string[];
  comandoPgRestore?: string[];
}

export const COMANDO_AGE = ['age'];
export const COMANDO_PG_RESTORE = ['docker', 'compose', 'exec', '-T', 'postgres', 'pg_restore'];

export class ErroRestauracao extends Error {
  override name = 'ErroRestauracao';
}

export async function contarLinhas(url: string): Promise<Record<string, number>> {
  return comConexao(url, async (c) => {
    const tabelas = await c.query<{ nome: string }>(
      `SELECT tablename AS nome FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const contagem: Record<string, number> = {};
    for (const { nome } of tabelas.rows) {
      const r = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.${c.escapeIdentifier(nome)}`,
      );
      contagem[nome] = r.rows[0]?.n ?? 0;
    }
    return contagem;
  });
}

async function exigirBancoVazio(url: string): Promise<void> {
  const n = await comConexao(url, async (c) => {
    const r = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
        WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')`,
    );
    return r.rows[0]?.n ?? 0;
  });
  if (n > 0) {
    throw new ErroRestauracao(
      `O banco de destino não está vazio (${n} objetos em public). Crie um banco limpo.`,
    );
  }
}

function canalizar(origem: string[], destino: string[]): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const [cmdA, ...argsA] = origem;
    const [cmdB, ...argsB] = destino;
    if (!cmdA || !cmdB) return rejeitar(new ErroRestauracao('comando vazio'));
    const a = spawn(cmdA, argsA, { stdio: ['ignore', 'pipe', 'pipe'] });
    const b = spawn(cmdB, argsB, { stdio: ['pipe', 'inherit', 'pipe'] });
    let erroA = '';
    let erroB = '';
    a.stderr.on('data', (d: Buffer) => (erroA += d.toString()));
    b.stderr.on('data', (d: Buffer) => (erroB += d.toString()));
    a.stdout.pipe(b.stdin);
    let fim = 0;
    let falha: Error | undefined;
    const terminar = () => {
      if (++fim === 2) {
        if (falha) rejeitar(falha);
        else resolver();
      }
    };
    a.on('error', (e) => (falha ??= e));
    b.on('error', (e) => (falha ??= e));
    a.on('close', (codigo) => {
      if (codigo !== 0) falha ??= new ErroRestauracao(`age falhou (${codigo}): ${erroA.trim()}`);
      terminar();
    });
    b.on('close', (codigo) => {
      if (codigo !== 0) {
        falha ??= new ErroRestauracao(`pg_restore falhou (${codigo}): ${erroB.trim()}`);
      }
      terminar();
    });
  });
}

export async function restaurarBackup(opcoes: OpcoesRestaurar): Promise<Record<string, number>> {
  exigirHostPermitido(opcoes.urlDestino, HOSTS_LOCAIS);
  await exigirBancoVazio(opcoes.urlDestino);
  const age = [
    ...(opcoes.comandoAge ?? COMANDO_AGE),
    '-d',
    '-i',
    opcoes.chavePrivada,
    opcoes.arquivo,
  ];
  const pgRestore = [
    ...(opcoes.comandoPgRestore ?? COMANDO_PG_RESTORE),
    '--no-owner',
    // Os GRANTs e ALTER DEFAULT PRIVILEGES do dump citam roles do Neon (neon_superuser, cloud_admin) que não existem aqui.
    '--no-privileges',
    '--exit-on-error',
    '--dbname',
    opcoes.urlPgRestore ?? opcoes.urlDestino,
  ];
  await canalizar(age, pgRestore);
  return contarLinhas(opcoes.urlDestino);
}

if (import.meta.main) {
  await executarCli(async () => {
    const [arquivo, chavePrivada, url] = process.argv.slice(2);
    const urlDestino = url ?? process.env.DATABASE_URL_RESTAURACAO;
    if (!arquivo || !chavePrivada || !urlDestino) {
      throw new ErroRestauracao(
        'Uso: pnpm restaurar <backup.age> <chave-privada.txt> <url-do-banco-local-vazio>',
      );
    }
    const contagem = await restaurarBackup({ arquivo, chavePrivada, urlDestino });
    console.log('Linhas por tabela:');
    for (const [tabela, n] of Object.entries(contagem)) console.log(`  ${tabela}: ${n}`);
  });
}
