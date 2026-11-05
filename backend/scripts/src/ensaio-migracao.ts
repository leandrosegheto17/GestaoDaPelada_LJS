import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPCOES_REFERENCIA, TABELAS_IGNORADAS, lerEsquema, lerReferencia } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import type pg from 'pg';
import { contarLinhas, restaurarBackup } from '../ops/restaurar-backup.ts';
import { comConexao, executarCli } from './conectar.ts';
import { compararEsquema, type Diferencas } from './esquema-comparar.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';

/**
 * Ensaio das migrações sobre um dump da produção (financeiro T15; FIN-42, FIN-39; AD-032, AD-033, AD-073).
 * `pnpm --filter @pelada/scripts ensaio <backup.age> <chave-privada.txt>`: cria um banco `ensaio_*` no Postgres local,
 * restaura nele o backup cifrado (decifrado pelo usuário com a chave que fica fora do repositório), roda `ensaiar` e
 * apaga o banco no `finally`. Nada roda contra a `main` do Neon: o host precisa ser local.
 *
 * `ensaiar(url)` é o núcleo, sobre um banco já restaurado:
 * 1. recusa o dump sem linhas nas tabelas de negócio (AD-014): o ensaio não provaria nada;
 * 2. conta as linhas por tabela, aplica `migrar` e conta de novo: nenhuma tabela muda (as que as migrações de outras
 *    features enchem de propósito vão em `podeGanhar` e só podem crescer);
 * 3. compara o schema com a referência (`esquema-producao.txt`);
 * 4. roda `migrar` de novo: nada a aplicar, contagem igual (zero DDL);
 * 5. amostra de 1 grupo (FIN-39): a conta com `acessa_financeiro` lê o caixa inteiro dele como `pelada_app`; uma conta
 *    do mesmo grupo sem acesso, quando existe, lê zero linhas.
 * 6. pesos padrão (partidas-e-ranking T81; PAR-13, PAR-14): `config_pesos` é a única tabela que as migrações enchem de
 *    propósito (`podeGanhar` por padrão) e ganha exatamente uma linha por grupo que deixou de estar sem configuração;
 *    quando a `pesos-padrao` é aplicada no ensaio, nenhum grupo pode ficar sem configuração.
 * O schema conferido no passo 3 já inclui as funções, grants e a policy das migrações de partidas (PAR-91).
 * 7. mudança do schema do dump (simulador T42; SIM-67, AD-037, AD-048, AD-073): o schema lido antes de migrar contra o
 *    de depois, para a evidência mostrar o que as migrações em ensaio tiraram e puseram (com a `grupo-criar-contrair`,
 *    só a `grupo_criar` de 6 parâmetros sai). Só informa: quem reprova é a referência do passo 3.
 * 8. situação comercial (planos-e-cobranca T18; PLA-11, PLA-12; AD-057, AD-113): a situação de cada grupo antes e
 *    depois, sem nome (só id e slug). Quando a `planos-cortesia` é aplicada no ensaio, dos grupos que eram
 *    `uso_proprio` só o do slug do grupo de teste continua `uso_proprio`; os demais ficam `trial` com a data do ensaio
 *    (São Paulo); quem já tinha outra situação não muda. Nenhuma tabela muda de contagem (passo 2).
 */

export class ErroEnsaio extends Error {
  override name = 'ErroEnsaio';
}

const TABELAS_DO_CAIXA = ['config_financeira', 'lancamentos', 'pagamentos_mes'] as const;

export interface OpcoesEnsaio {
  /** Pasta das migrações; padrão: as da v2. */
  pasta?: string;
  /** Referência do schema; padrão: `esquema-producao.txt`. */
  referencia?: readonly string[];
  /** Tabelas que as migrações em ensaio podem encher de propósito (só crescem), além de `config_pesos`. */
  podeGanhar?: readonly string[];
  /** Slug do grupo de teste (T9); padrão: o da constante `SLUG_GRUPO_TESTE` da `planos-cortesia`. */
  slugGrupoTeste?: string;
}

/** Sufixo da migração da cortesia (planos-e-cobranca T17). */
const MIGRACAO_CORTESIA = '_planos-cortesia';

export interface SituacaoNoEnsaio {
  grupoId: string;
  slug: string;
  antes: string;
  depois: string;
  trialInicioDepois: string | null;
}

export interface PlanosNoEnsaio {
  /** O slug que a conferência usou (nulo quando a cortesia não foi aplicada no ensaio). */
  slugGrupoTeste: string | null;
  /** Data de São Paulo do ensaio. */
  hoje: string;
  grupos: SituacaoNoEnsaio[];
  /** O que destoa da regra do passo 8; vazio = ok. */
  problemas: string[];
}

/** Tabelas que as migrações da v2 enchem de propósito: os pesos padrão (partidas T21). */
export const PODE_GANHAR_PADRAO = ['config_pesos'] as const;

/** Sufixo da migração que cria os pesos padrão (partidas T21). */
const MIGRACAO_PESOS_PADRAO = '_pesos-padrao';

export interface PesosNoEnsaio {
  /** Grupos sem linha em `config_pesos` antes de migrar. */
  semConfigAntes: number;
  /** Grupos sem linha em `config_pesos` depois de migrar. */
  semConfigDepois: number;
  /** Linhas que `config_pesos` ganhou. */
  linhasNovas: number;
}

export interface AmostraAcesso {
  grupoId: string;
  /** Linhas do caixa do grupo, contadas pelo dono do schema. */
  esperadas: number;
  /** Linhas que a conta com acesso leu como `pelada_app`. */
  lidasComAcesso: number;
  /** Linhas que uma conta do grupo sem acesso leu; ausente quando o grupo não tem conta assim. */
  lidasSemAcesso?: number;
}

/** O que o schema do dump perdeu e ganhou com as migrações em ensaio (linhas do `lerEsquema`). */
export interface MudancaDoEsquema {
  removidas: string[];
  novas: string[];
}

export interface RelatorioEnsaio {
  aplicadas: string[];
  antes: Record<string, number>;
  depois: Record<string, number>;
  /** Tabelas cuja contagem mudou sem estar em `podeGanhar`, ou que perderam linha. */
  tabelasAlteradas: string[];
  esquema: Diferencas;
  segundaExecucao: string[];
  amostra: AmostraAcesso | null;
  pesos: PesosNoEnsaio;
  mudancaDoEsquema: MudancaDoEsquema;
  planos: PlanosNoEnsaio;
  ok: boolean;
}

async function situacoesDosGrupos(url: string): Promise<Map<string, { slug: string; s: string; t: string | null }>> {
  return comConexao(url, async (c) => {
    const r = await c.query<{ id: string; slug: string; s: string; t: string | null }>(
      'SELECT id, slug, situacao_comercial AS s, trial_inicio::text AS t FROM grupos ORDER BY id',
    );
    return new Map(r.rows.map((l) => [l.id, { slug: l.slug, s: l.s, t: l.t }]));
  });
}

async function hojeEmSaoPaulo(url: string): Promise<string> {
  return comConexao(url, async (c) => {
    const r = await c.query<{ hoje: string }>(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS hoje`);
    return r.rows[0]?.hoje ?? '';
  });
}

/** A regra do passo 8 sobre as situações de antes e de depois. */
export function conferirPlanos(
  antes: Map<string, { slug: string; s: string; t: string | null }>,
  depois: Map<string, { slug: string; s: string; t: string | null }>,
  slugGrupoTeste: string | null,
  hoje: string,
): PlanosNoEnsaio {
  const grupos: SituacaoNoEnsaio[] = [];
  const problemas: string[] = [];
  for (const [grupoId, a] of antes) {
    const d = depois.get(grupoId);
    if (!d) {
      problemas.push(`${grupoId}: sumiu`);
      continue;
    }
    grupos.push({ grupoId, slug: a.slug, antes: a.s, depois: d.s, trialInicioDepois: d.t });
    if (slugGrupoTeste === null) {
      if (a.s !== d.s || a.t !== d.t) problemas.push(`${grupoId}: mudou de ${a.s} para ${d.s} sem a cortesia no ensaio`);
      continue;
    }
    if (a.s !== 'uso_proprio') {
      if (a.s !== d.s || a.t !== d.t) problemas.push(`${grupoId}: ${a.s} mudou para ${d.s}`);
    } else if (a.slug === slugGrupoTeste) {
      if (d.s !== 'uso_proprio' || d.t !== null) problemas.push(`${grupoId}: o grupo de teste deixou a cortesia (${d.s})`);
    } else if (d.s !== 'trial' || d.t !== hoje) {
      problemas.push(`${grupoId}: uso_proprio virou ${d.s} com trial_inicio ${d.t ?? 'nulo'}, esperado trial em ${hoje}`);
    }
  }
  if (slugGrupoTeste !== null && ![...antes.values()].some((a) => a.slug === slugGrupoTeste)) {
    problemas.push(`nenhum grupo com o slug do grupo de teste (${slugGrupoTeste})`);
  }
  return { slugGrupoTeste, hoje, grupos, problemas };
}

/** O slug da constante `SLUG_GRUPO_TESTE` da migração da cortesia na pasta, ou nulo sem a migração. */
export function slugDaCortesia(pasta: string): string | null {
  const nome = readdirSync(pasta).find((n) => n.replace(/\.sql$/, '').endsWith(MIGRACAO_CORTESIA));
  if (!nome) return null;
  const valor = /SLUG_GRUPO_TESTE constant text := '([^']*)';/.exec(readFileSync(join(pasta, nome), 'utf8'))?.[1];
  return valor ?? null;
}

async function esquemaDe(url: string): Promise<string[]> {
  return comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
}

/** Linhas que só existem antes (removidas) e só depois (novas), ordenadas. */
export function mudancaDoEsquema(antes: readonly string[], depois: readonly string[]): MudancaDoEsquema {
  const deDepois = new Set(depois);
  const deAntes = new Set(antes);
  return {
    removidas: antes.filter((l) => !deDepois.has(l)).sort(),
    novas: depois.filter((l) => !deAntes.has(l)).sort(),
  };
}

async function gruposSemConfig(url: string): Promise<number> {
  return comConexao(url, async (c) => {
    const r = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM grupos g WHERE NOT EXISTS (SELECT 1 FROM config_pesos p WHERE p.grupo_id = g.id)`,
    );
    return r.rows[0]?.n ?? 0;
  });
}

/** Uma linha nova por grupo que passou a ter configuração; com a `pesos-padrao` aplicada, nenhum grupo fica sem. */
function pesosOk(p: PesosNoEnsaio, aplicadas: readonly string[]): boolean {
  const comPesosPadrao = aplicadas.some((n) => n.replace(/\.sql$/, '').endsWith(MIGRACAO_PESOS_PADRAO));
  if (comPesosPadrao && p.semConfigDepois !== 0) return false;
  return p.linhasNovas === p.semConfigAntes - p.semConfigDepois;
}

function semIgnoradas(contagem: Record<string, number>): Record<string, number> {
  const ignoradas: readonly string[] = TABELAS_IGNORADAS;
  return Object.fromEntries(Object.entries(contagem).filter(([tabela]) => !ignoradas.includes(tabela)));
}

function alteradas(antes: Record<string, number>, depois: Record<string, number>, podeGanhar: readonly string[]): string[] {
  const tabelas = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const mudadas: string[] = [];
  for (const tabela of tabelas) {
    const a = antes[tabela] ?? 0;
    const d = depois[tabela] ?? 0;
    const permitido = podeGanhar.includes(tabela) ? d >= a : d === a;
    if (!permitido) mudadas.push(`${tabela}: ${a} → ${d}`);
  }
  return mudadas.sort();
}

async function linhasDoCaixa(c: pg.Client, grupoId: string): Promise<number> {
  let total = 0;
  for (const tabela of TABELAS_DO_CAIXA) {
    const r = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabela} WHERE grupo_id = $1`, [grupoId]);
    total += r.rows[0]?.n ?? 0;
  }
  return total;
}

/** Linhas do caixa do grupo que a conta enxerga como `pelada_app`, numa transação desfeita ao fim. */
async function lerComoApp(c: pg.Client, conta: string, grupoId: string): Promise<number> {
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE pelada_app');
    await c.query(`SELECT set_config('app.conta_id', $1, true)`, [conta]);
    return await linhasDoCaixa(c, grupoId);
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
  }
}

/** Um grupo ativo com caixa e uma conta com acesso; prefere um que também tenha conta sem acesso. */
async function escolherAmostra(url: string): Promise<AmostraAcesso | null> {
  return comConexao(url, async (c) => {
    const r = await c.query<{ grupo_id: string; com_acesso: string; sem_acesso: string | null }>(
      `SELECT grupo_id, com_acesso, sem_acesso
         FROM (SELECT v.grupo_id, v.conta_id AS com_acesso,
                      (SELECT o.conta_id FROM vinculos_admin o
                        WHERE o.grupo_id = v.grupo_id AND NOT o.acessa_financeiro ORDER BY o.conta_id LIMIT 1) AS sem_acesso
                 FROM vinculos_admin v JOIN grupos g ON g.id = v.grupo_id
                WHERE v.acessa_financeiro AND g.arquivado_em IS NULL
                  AND (EXISTS (SELECT 1 FROM lancamentos l WHERE l.grupo_id = v.grupo_id)
                       OR EXISTS (SELECT 1 FROM config_financeira f WHERE f.grupo_id = v.grupo_id))) q
        ORDER BY (sem_acesso IS NOT NULL) DESC, grupo_id, com_acesso
        LIMIT 1`,
    );
    const linha = r.rows[0];
    if (!linha) return null;
    const esperadas = await linhasDoCaixa(c, linha.grupo_id);
    const lidasComAcesso = await lerComoApp(c, linha.com_acesso, linha.grupo_id);
    const amostra: AmostraAcesso = { grupoId: linha.grupo_id, esperadas, lidasComAcesso };
    if (linha.sem_acesso) amostra.lidasSemAcesso = await lerComoApp(c, linha.sem_acesso, linha.grupo_id);
    return amostra;
  });
}

function amostraOk(a: AmostraAcesso | null): boolean {
  if (!a) return false;
  return a.esperadas > 0 && a.lidasComAcesso === a.esperadas && (a.lidasSemAcesso ?? 0) === 0;
}

export async function ensaiar(url: string, opcoes: OpcoesEnsaio = {}): Promise<RelatorioEnsaio> {
  exigirHostPermitido(url, HOSTS_LOCAIS);
  const podeGanhar = [...PODE_GANHAR_PADRAO, ...(opcoes.podeGanhar ?? [])];
  const referencia = opcoes.referencia ?? lerReferencia();

  const antes = semIgnoradas(await contarLinhas(url));
  if ((antes.grupos ?? 0) === 0 || Object.values(antes).every((n) => n === 0)) {
    throw new ErroEnsaio(
      'O dump não tem linhas nas tabelas de negócio (pendência da AD-014): o ensaio não prova nada. Pare e decida com o usuário.',
    );
  }
  const semConfigAntes = await gruposSemConfig(url);
  const esquemaAntes = await esquemaDe(url);
  const situacoesAntes = await situacoesDosGrupos(url);

  const aplicadas = await migrar(url, { pasta: opcoes.pasta });
  const depois = semIgnoradas(await contarLinhas(url));
  const comCortesia = aplicadas.some((n) => n.replace(/\.sql$/, '').endsWith(MIGRACAO_CORTESIA));
  const slugGrupoTeste = comCortesia ? (opcoes.slugGrupoTeste ?? slugDaCortesia(opcoes.pasta ?? PASTA_MIGRACOES)) : null;
  const planos = conferirPlanos(situacoesAntes, await situacoesDosGrupos(url), slugGrupoTeste, await hojeEmSaoPaulo(url));
  const pesos: PesosNoEnsaio = {
    semConfigAntes,
    semConfigDepois: await gruposSemConfig(url),
    linhasNovas: (depois.config_pesos ?? 0) - (antes.config_pesos ?? 0),
  };
  const esquema = await compararEsquema(url, referencia);
  const mudanca = mudancaDoEsquema(esquemaAntes, await esquemaDe(url));

  const segundaExecucao = await migrar(url, { pasta: opcoes.pasta });
  const depoisDaSegunda = semIgnoradas(await contarLinhas(url));
  const tabelasAlteradas = alteradas(antes, depois, podeGanhar);
  if (JSON.stringify(depoisDaSegunda) !== JSON.stringify(depois)) tabelasAlteradas.push('segunda execução mudou linhas');

  const amostra = await escolherAmostra(url);
  const ok =
    tabelasAlteradas.length === 0 &&
    esquema.faltando.length === 0 &&
    esquema.sobrando.length === 0 &&
    segundaExecucao.length === 0 &&
    amostraOk(amostra) &&
    pesosOk(pesos, aplicadas) &&
    planos.problemas.length === 0;
  return {
    aplicadas,
    antes,
    depois,
    tabelasAlteradas,
    esquema,
    segundaExecucao,
    amostra,
    pesos,
    mudancaDoEsquema: mudanca,
    planos,
    ok,
  };
}

export const URL_BASE_ENSAIO = process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

function urlDoBanco(base: string, banco: string): string {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

/** Restaura o backup num banco `ensaio_*` vazio, ensaia e apaga o banco no `finally`. */
export async function ensaiarBackup(
  arquivo: string,
  chavePrivada: string,
  opcoes: OpcoesEnsaio = {},
  base: string = URL_BASE_ENSAIO,
): Promise<RelatorioEnsaio> {
  exigirHostPermitido(base, HOSTS_LOCAIS);
  const nome = `ensaio_${randomBytes(6).toString('hex')}`;
  await comConexao(base, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const urlDestino = urlDoBanco(base, nome);
    await restaurarBackup({ arquivo, chavePrivada, urlDestino });
    return await ensaiar(urlDestino, opcoes);
  } finally {
    await comConexao(base, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

function imprimir(r: RelatorioEnsaio): void {
  console.log(`Migrações aplicadas (${r.aplicadas.length}): ${r.aplicadas.join(', ') || 'nenhuma'}`);
  console.log('Linhas por tabela (antes → depois):');
  for (const tabela of Object.keys(r.depois).sort()) console.log(`  ${tabela}: ${r.antes[tabela] ?? 0} → ${r.depois[tabela]}`);
  if (r.tabelasAlteradas.length > 0) console.log(`Tabelas alteradas: ${r.tabelasAlteradas.join('; ')}`);
  console.log(`Schema: faltando ${r.esquema.faltando.length}, sobrando ${r.esquema.sobrando.length}`);
  for (const l of r.esquema.faltando) console.log(`  - ${l}`);
  for (const l of r.esquema.sobrando) console.log(`  + ${l}`);
  const m = r.mudancaDoEsquema;
  console.log(`Mudança do schema do dump: ${m.removidas.length} linhas removidas, ${m.novas.length} novas`);
  for (const l of m.removidas) console.log(`  - ${l}`);
  for (const l of m.novas) console.log(`  + ${l}`);
  console.log(`Segunda execução: ${r.segundaExecucao.length === 0 ? 'nada a aplicar' : r.segundaExecucao.join(', ')}`);
  const a = r.amostra;
  console.log(
    a
      ? `Amostra do grupo ${a.grupoId}: ${a.esperadas} linhas no caixa; conta com acesso leu ${a.lidasComAcesso}` +
          (a.lidasSemAcesso === undefined ? '; sem conta sem acesso para comparar' : `; conta sem acesso leu ${a.lidasSemAcesso}`)
      : 'Amostra: nenhum grupo ativo com caixa e conta com acesso',
  );
  const p = r.pesos;
  console.log(
    `Pesos padrão: ${p.semConfigAntes} grupos sem configuração antes, ${p.semConfigDepois} depois; config_pesos ganhou ${p.linhasNovas}`,
  );
  const pl = r.planos;
  console.log(
    pl.slugGrupoTeste === null
      ? 'Situação comercial: a cortesia não foi aplicada neste ensaio'
      : `Situação comercial (grupo de teste ${pl.slugGrupoTeste}, data do ensaio ${pl.hoje}):`,
  );
  // Só id e situação: o ensaio não imprime nome de grupo nem de pessoa.
  for (const g of pl.grupos) console.log(`  ${g.grupoId}: ${g.antes} → ${g.depois}${g.trialInicioDepois ? ` (${g.trialInicioDepois})` : ''}`);
  for (const problema of pl.problemas) console.log(`  ! ${problema}`);
  console.log(r.ok ? 'Ensaio ok.' : 'Ensaio com problemas: não faça o deploy da prévia.');
}

if (import.meta.main) {
  await executarCli(async () => {
    const [arquivo, chavePrivada] = process.argv.slice(2);
    if (!arquivo || !chavePrivada) throw new ErroEnsaio('Uso: pnpm --filter @pelada/scripts ensaio <backup.age> <chave-privada.txt>');
    const r = await ensaiarBackup(arquivo, chavePrivada);
    imprimir(r);
    if (!r.ok) process.exitCode = 1;
  });
}
