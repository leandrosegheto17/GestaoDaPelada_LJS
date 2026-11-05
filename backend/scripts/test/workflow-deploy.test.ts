import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checarActions } from '../checagens/actions-por-sha.ts';
import { lerWorkflow, SHA_40, textoDo, usesExternos, type Passo } from './apoio/workflow.ts';

/**
 * deploy.yml (FUN-41 a FUN-44, FUN-57, FUN-58; AD-119): só à mão, só na main, environment
 * producao, sem cancelar, e os passos na ordem build, restauração, dump, migração, deploy e
 * saúde, parando no primeiro erro.
 */

const wf = lerWorkflow('deploy.yml');
const texto = textoDo('.github/workflows/deploy.yml');
const job = wf.jobs.deploy;
const lista: Passo[] = job?.steps ?? [];

/** Índice do primeiro passo que casa com o critério; -1 se nenhum. */
function indice(criterio: (p: Passo) => boolean): number {
  return lista.findIndex(criterio);
}

const roda = (re: RegExp) => (p: Passo) => re.test(p.run ?? '');
const usa = (prefixo: string) => (p: Passo) => (p.uses ?? '').startsWith(prefixo);

const BUILD = indice(roda(/pnpm --filter @pelada\/web build\b/));
const URL = indice((p) => p.name === 'Conferir URL_PUBLICA');
const RESTAURACAO = indice(roda(/ops\/restauracao-neon\.ts/));
const DUMP = indice(usa('./.github/actions/dump-cifrado'));
const MIGRACAO = indice(roda(/pnpm migrar\b/));
const DEPLOY = indice(roda(/wrangler\s+deploy\b/));
const SAUDE = indice(roda(/ops\/verificar-saude\.mjs/));

/** Passo usa algum secret do Neon ou da Cloudflare (no env, no with ou no run). */
function usaSecretSensivel(p: Passo): boolean {
  return /secrets\.(NEON_|CLOUDFLARE_)/.test(JSON.stringify(p));
}

/** Roda o script do passo no bash com o ambiente dado. */
function rodarPasso(p: Passo | undefined, env: Record<string, string>) {
  return spawnSync('bash', ['-c', p?.run ?? 'exit 99'], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
}

describe('deploy.yml', () => {
  it('FUN-41: só workflow_dispatch, condição de main e environment producao (AD-119)', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(wf.jobs)).toEqual(['deploy']);
    expect(job?.if).toBe("github.ref == 'refs/heads/main'");
    expect(job?.environment).toBe('producao');
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('FUN-57: concurrency com cancel-in-progress: false', () => {
    expect(wf.concurrency?.group).toBeTruthy();
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('FUN-42: a ordem dos passos é build, restauração, dump, migração, deploy, saúde', () => {
    const ordem = [BUILD, RESTAURACAO, DUMP, MIGRACAO, DEPLOY, SAUDE];
    for (const i of ordem) expect(i).toBeGreaterThanOrEqual(0);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it('FUN-42: o dump usa pelada_backup_ro (NEON_URL_BACKUP, AD-010) e a migração a role de migração', () => {
    expect(lista[DUMP]?.with?.url).toBe('${{ secrets.NEON_URL_BACKUP }}');
    expect(lista[MIGRACAO]?.env?.DATABASE_URL_MIGRACAO).toBe('${{ secrets.NEON_URL_MIGRACAO }}');
  });

  it('FUN-42: o deploy injeta VERSAO com o SHA e URL_PUBLICA', () => {
    const run = lista[DEPLOY]?.run ?? '';
    expect(run).toContain('VERSAO:${{ github.sha }}');
    expect(run).toContain('URL_PUBLICA:$URL_PUBLICA');
  });

  it('FUN-43: o build vem antes de qualquer passo que use secrets do Neon ou da Cloudflare', () => {
    const primeiroSensivel = indice(usaSecretSensivel);
    expect(primeiroSensivel).toBeGreaterThan(BUILD);
    expect(usaSecretSensivel(lista[BUILD] as Passo)).toBe(false);
    for (const p of lista.slice(0, BUILD + 1)) expect(usaSecretSensivel(p), p.name ?? p.uses).toBe(false);
  });

  it('FUN-44: o deploy vem depois da migração, e nenhum passo segue em erro nem tem if próprio', () => {
    expect(DEPLOY).toBeGreaterThan(MIGRACAO);
    expect(texto).not.toMatch(/continue-on-error/);
    for (const p of lista.slice(0, SAUDE + 1)) {
      expect(p['continue-on-error'], p.name).toBeUndefined();
      expect(p.if, p.name).toBeUndefined();
    }
  });

  it('FUN-58: URL_PUBLICA vazia faz um passo anterior ao deploy falhar', () => {
    expect(URL).toBeGreaterThanOrEqual(0);
    expect(URL).toBeLessThan(DEPLOY);
    expect(rodarPasso(lista[URL], { URL_PUBLICA: '' }).status).not.toBe(0);
    expect(rodarPasso(lista[URL], {}).status).not.toBe(0);
    expect(rodarPasso(lista[URL], { URL_PUBLICA: 'http://sem-tls.exemplo' }).status).not.toBe(0);
    expect(rodarPasso(lista[URL], { URL_PUBLICA: 'https://app.exemplo' }).status).toBe(0);
  });

  it('FUN-41: toda action de terceiros está fixada por SHA', () => {
    for (const u of usesExternos(texto)) expect(u).toMatch(SHA_40);
    expect(checarActions([{ caminho: '.github/workflows/deploy.yml', conteudo: texto }])).toEqual([]);
  });
});
