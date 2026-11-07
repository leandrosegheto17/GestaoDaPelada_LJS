import { describe, expect, it } from 'vitest';
import { lerWorkflow, passos, SHA_40, textoDo, usesExternos, type Job } from './apoio/workflow.ts';
import { checarActions } from '../checagens/actions-por-sha.ts';
import { checarWrangler } from '../checagens/wrangler-unico.ts';

const wf = lerWorkflow('ci.yml');
const texto = textoDo('.github/workflows/ci.yml');

function runs(job: Job | undefined): string {
  return (job?.steps ?? []).map((p) => p.run ?? '').join('\n');
}

const todosOsRuns = Object.values(wf.jobs).map(runs).join('\n');

describe('ci.yml', () => {
  it('FUN-40: roda em push e em pull_request', () => {
    expect('push' in wf.on).toBe(true);
    expect('pull_request' in wf.on).toBe(true);
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('FUN-40: tem os jobs qualidade, testes e banco', () => {
    for (const nome of ['qualidade', 'testes', 'banco'])
      expect(Object.keys(wf.jobs)).toContain(nome);
  });

  it('FUN-40: os jobs testes e banco usam o serviço postgres:18', () => {
    for (const nome of ['testes', 'banco']) {
      expect(wf.jobs[nome]?.services?.postgres?.image, nome).toBe('postgres:18');
    }
  });

  it('FUN-40: o job qualidade roda lint, format, typecheck, as checagens e o gitleaks', () => {
    const q = runs(wf.jobs.qualidade);
    expect(q).toMatch(/pnpm lint\b/);
    expect(q).toMatch(/pnpm format:check\b/);
    expect(q).toMatch(/pnpm typecheck\b/);
    for (const checagem of [
      'actions-por-sha',
      'wrangler-unico',
      'env-example',
      'sem-url-absoluta',
      'migracao-aditiva',
    ]) {
      expect(q).toContain(`checagens/${checagem}.ts`);
    }
    expect(
      (wf.jobs.qualidade?.steps ?? []).some((p) => p.uses?.startsWith('gitleaks/gitleaks-action@')),
    ).toBe(true);
  });

  it('A-13: o job qualidade audita as dependências de produção e falha em severidade alta ou crítica (AD-130)', () => {
    expect(runs(wf.jobs.qualidade)).toMatch(/pnpm audit --prod --audit-level high$/m);
  });

  it('FUN-40: o job testes roda a suíte inteira em 3 jobs paralelos, com as checagens na entrada demais', () => {
    const testes = wf.jobs.testes;
    const matriz = (testes?.strategy?.matrix?.include ?? []) as Array<{
      nome: string;
      comando: string;
    }>;
    expect(matriz.map((m) => m.nome)).toEqual(['api-banco', 'api-worker', 'demais']);
    const comando = (nome: string) => matriz.find((m) => m.nome === nome)?.comando ?? '';
    // O api inteiro: os dois projetos do vitest, sem sobra nem repetição.
    expect(comando('api-banco')).toMatch(/@pelada\/api exec vitest run --project banco\b/);
    expect(comando('api-worker')).toMatch(/@pelada\/api exec vitest run --project worker\b/);
    // O resto da suíte: raiz e os demais pacotes (o api fica de fora), mais as checagens.
    expect(comando('demais')).toMatch(/vitest run --dir test\b/);
    expect(comando('demais')).toMatch(/pnpm -r --filter '!@pelada\/api' test\b/);
    expect(comando('demais')).toMatch(/pnpm test:checagens\b/);
    expect(runs(testes)).toMatch(/\$\{\{ matrix\.comando \}\}/);
  });

  it('FUN-40: o dump do teste de backup usa o pg_dump 18, igual ao servidor de serviço (NOT-58)', () => {
    const passo = (wf.jobs.testes?.steps ?? []).find((p) => /pg_dump 18/.test(p.name ?? ''));
    expect(passo?.if).toBe("matrix.nome == 'api-banco'");
    expect(passo?.run).toMatch(/postgresql-client-18/);
  });

  it('FUN-40: o job banco migra do zero, migra de novo e roda impressão digital, estado e isolamento', () => {
    const b = runs(wf.jobs.banco);
    expect(b.match(/pnpm migrar\b/g)).toHaveLength(2);
    expect(b).toContain('test/migracoes');
    expect(b).toContain('test/isolamento');
  });

  it('FUN-40: o banco dos testes é o Postgres de serviço, nunca o Neon (FUN-19)', () => {
    expect(texto).not.toMatch(/neon\.tech/i);
    expect(texto).not.toMatch(/secrets\.NEON_/);
    expect(todosOsRuns).not.toMatch(/PELADA_PERMITIR_HOST_REMOTO/);
  });

  it('FUN-40: nenhum passo nem job usa continue-on-error', () => {
    expect(texto).not.toMatch(/continue-on-error/);
    for (const job of Object.values(wf.jobs)) {
      expect(job['continue-on-error']).toBeUndefined();
      for (const p of job.steps ?? []) expect(p['continue-on-error']).toBeUndefined();
    }
  });

  it('FUN-40: toda action de terceiros está fixada por SHA (checagem da T64)', () => {
    for (const u of usesExternos(texto)) expect(u).toMatch(SHA_40);
    expect(checarActions([{ caminho: '.github/workflows/ci.yml', conteudo: texto }])).toEqual([]);
  });

  it('FUN-40: o checkout não guarda a credencial do GitHub', () => {
    const checkouts = passos(wf).filter((p) => p.uses?.startsWith('actions/checkout@'));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const c of checkouts) expect(c.with?.['persist-credentials']).toBe(false);
  });
});

describe('ci.yml: job web', () => {
  const web = wf.jobs.web;
  const passosWeb = web?.steps ?? [];
  const runsWeb = runs(web);

  it('FUN-40: o job web tem build e e2e, nessa ordem, em 3 fatias em paralelo', () => {
    const iBuild = passosWeb.findIndex((p) =>
      /pnpm --filter @pelada\/web build\b/.test(p.run ?? ''),
    );
    const iE2e = passosWeb.findIndex((p) => /playwright test\b/.test(p.run ?? ''));
    expect(iBuild).toBeGreaterThanOrEqual(0);
    expect(iE2e).toBeGreaterThan(iBuild);
    expect(passosWeb[iE2e]?.run).toMatch(/--shard=\$\{\{ matrix\.shard \}\}/);
    expect(web?.strategy?.matrix?.shard).toEqual(['1/3', '2/3', '3/3']);
    expect(runsWeb).toMatch(/playwright install --with-deps chromium/);
  });

  it('FUN-40: a comparação visual com o mockup não roda no CI (é do verificador no /validar)', () => {
    expect(Object.keys(wf.jobs)).not.toContain('web-visual');
    expect(todosOsRuns).not.toMatch(/@pelada\/web visual/);
  });

  it('FUN-40: em caso de falha, envia o relatório do Playwright e os prints', () => {
    const envio = passosWeb.find((p) => p.uses?.startsWith('actions/upload-artifact@'));
    expect(envio?.if).toBe('failure()');
    const caminhos = String(envio?.with?.path ?? '');
    expect(caminhos).toContain('frontend/web/playwright-report');
    expect(caminhos).toContain('frontend/web/test-results');
  });

  it('FUN-40: o workflow completo passa nas checagens de SHA e de deploy único', () => {
    expect(checarActions([{ caminho: '.github/workflows/ci.yml', conteudo: texto }])).toEqual([]);
    expect(checarWrangler([{ caminho: '.github/workflows/ci.yml', conteudo: texto }])).toEqual([]);
  });
});
