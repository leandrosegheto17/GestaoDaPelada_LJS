import { lerEsquema, lerReferencia, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar } from '@pelada/api/migrar';
import { contarLinhas } from '../ops/restaurar-backup.ts';
import { comConexao, executarCli } from './conectar.ts';
import { exigirHostPermitido, HOSTS_TESTE } from './host.ts';

/**
 * `pnpm esquema:comparar --alvo dev [--migrar]` (FUN-08, FUN-09, FUN-11; T80): compara a
 * impressão digital do schema de um banco (`lerEsquema`) com a referência
 * `esquema-producao.txt` e lista o que falta e o que sobra. Só lê, a não ser com `--migrar`.
 *
 * Com `--migrar`: conta as linhas por tabela, roda `migrar` e conta de novo. Zero migrações
 * aplicadas é zero DDL (o runner só executa DDL dentro das migrações); a contagem tem de ser
 * idêntica (FUN-09).
 *
 * Alvos:
 * - `dev`: `NEON_URL_DEV_MIGRACAO` (role `pelada_owner` da branch `dev` do Neon). Host remoto só
 *   com `PELADA_PERMITIR_HOST_REMOTO=1` no `.env`, e a confirmação específica antes de rodar.
 * - `local`: `DATABASE_URL_TESTE` (ou o banco local do docker compose).
 *
 * Sai com código 1 quando há diferença ou a contagem muda: a lista vai para o `STATE.md` e é
 * decidida (T80).
 */

export class ErroComparar extends Error {
  override name = 'ErroComparar';
}

export interface Diferencas {
  /** Linhas da referência que o banco não tem. */
  faltando: string[];
  /** Linhas do banco que a referência não tem. */
  sobrando: string[];
}

export function diferencas(referencia: readonly string[], atual: readonly string[]): Diferencas {
  const ref = new Set(referencia);
  const banco = new Set(atual);
  return {
    faltando: referencia.filter((l) => !banco.has(l)),
    sobrando: atual.filter((l) => !ref.has(l)),
  };
}

export async function compararEsquema(
  url: string,
  referencia: readonly string[] = lerReferencia(),
): Promise<Diferencas> {
  const atual = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  return diferencas(referencia, atual);
}

/** As três roles da aplicação (FUN-11) e a dona do schema no Neon (AD-009). */
export const ROLES_CONFERIDAS = ['pelada_owner', 'pelada_app', 'pelada_backup_ro'] as const;

export async function conferirRoles(url: string): Promise<Record<string, boolean>> {
  return comConexao(url, async (c) => {
    const r = await c.query<{ rolname: string }>(
      'SELECT rolname FROM pg_roles WHERE rolname = ANY($1)',
      [[...ROLES_CONFERIDAS]],
    );
    const presentes = new Set(r.rows.map((l) => l.rolname));
    return Object.fromEntries(ROLES_CONFERIDAS.map((nome) => [nome, presentes.has(nome)]));
  });
}

export interface ResultadoMigracao {
  aplicadas: string[];
  antes: Record<string, number>;
  depois: Record<string, number>;
  contagemIgual: boolean;
}

export async function migrarConferindo(url: string): Promise<ResultadoMigracao> {
  const antes = await contarLinhas(url);
  const aplicadas = await migrar(url);
  const depois = await contarLinhas(url);
  const contagemIgual = JSON.stringify(antes) === JSON.stringify(depois);
  return { aplicadas, antes, depois, contagemIgual };
}

export interface OpcoesComando {
  alvo: 'dev' | 'local';
  migrar: boolean;
}

export function lerArgumentos(argv: readonly string[]): OpcoesComando {
  const i = argv.indexOf('--alvo');
  const alvo = i >= 0 ? argv[i + 1] : undefined;
  if (alvo !== 'dev' && alvo !== 'local')
    throw new ErroComparar('Uso: pnpm esquema:comparar --alvo dev|local [--migrar]');
  return { alvo, migrar: argv.includes('--migrar') };
}

/** URL do alvo, com a trava de host: remoto só com `PELADA_PERMITIR_HOST_REMOTO=1`. */
export function urlDoAlvo(
  alvo: OpcoesComando['alvo'],
  env: Record<string, string | undefined>,
): string {
  const url =
    alvo === 'dev'
      ? env.NEON_URL_DEV_MIGRACAO
      : (env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada');
  if (!url) throw new ErroComparar('NEON_URL_DEV_MIGRACAO não definida (veja o .env.example).');
  if (env.PELADA_PERMITIR_HOST_REMOTO !== '1') exigirHostPermitido(url, HOSTS_TESTE);
  return url;
}

export interface Relatorio {
  diferencas: Diferencas;
  roles: Record<string, boolean>;
  migracao?: ResultadoMigracao;
  ok: boolean;
}

export async function comandoComparar(
  argv: readonly string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<Relatorio> {
  const opcoes = lerArgumentos(argv);
  const url = urlDoAlvo(opcoes.alvo, env);
  const migracao = opcoes.migrar ? await migrarConferindo(url) : undefined;
  const dif = await compararEsquema(url);
  const roles = await conferirRoles(url);
  const ok =
    dif.faltando.length === 0 &&
    dif.sobrando.length === 0 &&
    (!migracao || (migracao.aplicadas.length === 0 && migracao.contagemIgual));
  return { diferencas: dif, roles, migracao, ok };
}

function imprimir(r: Relatorio): void {
  if (r.migracao) {
    console.log(
      `Migrações aplicadas: ${r.migracao.aplicadas.length}${r.migracao.aplicadas.length ? ` (${r.migracao.aplicadas.join(', ')})` : ''}`,
    );
    console.log(
      `Contagem de linhas por tabela ${r.migracao.contagemIgual ? 'idêntica' : 'DIFERENTE'} antes e depois.`,
    );
    if (!r.migracao.contagemIgual) {
      for (const t of Object.keys({ ...r.migracao.antes, ...r.migracao.depois })) {
        if (r.migracao.antes[t] !== r.migracao.depois[t])
          console.log(`  ${t}: ${r.migracao.antes[t]} → ${r.migracao.depois[t]}`);
      }
    }
  }
  console.log(
    `Roles: ${Object.entries(r.roles)
      .map(([n, tem]) => `${n} ${tem ? 'existe' : 'AUSENTE'}`)
      .join(', ')}`,
  );
  console.log(`Faltando (${r.diferencas.faltando.length}):`);
  for (const l of r.diferencas.faltando) console.log(`  - ${l}`);
  console.log(`Sobrando (${r.diferencas.sobrando.length}):`);
  for (const l of r.diferencas.sobrando) console.log(`  + ${l}`);
  console.log(r.ok ? 'Paridade ok.' : 'Há diferenças: registre a lista no STATE.md e decida.');
}

if (import.meta.main) {
  await executarCli(async () => {
    const r = await comandoComparar();
    imprimir(r);
    if (!r.ok) process.exitCode = 1;
  });
}
