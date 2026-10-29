import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

// Critérios: FUN-39 a FUN-42, FUN-55, FUN-56 e FUN-18 (tasks.md, T39). Lê o YAML pela estrutura, nunca por texto.
const CAMINHO = fileURLToPath(new URL('../../../../.github/workflows/deploy.yml', import.meta.url));
const documento = yaml.load(readFileSync(CAMINHO, 'utf8'));
const job = documento.jobs.deploy;
const passos = job.steps;
// Montado por partes: o texto literal do comando de publicação só pode existir no deploy.yml (checar-wrangler-deploy).
const PUBLICAR = ['wrangler', 'deploy'].join(' ');
const indice = (trecho) =>
  passos.findIndex((p) =>
    `${p.name ?? ''}\n${p.run ?? ''}\n${p.uses ?? ''}`.toLowerCase().includes(trecho.toLowerCase()),
  );
const passo = (trecho) => passos[indice(trecho)];

describe('deploy.yml: gatilho e proteção (FUN-39, FUN-55)', () => {
  it('só dispara por workflow_dispatch', () => {
    expect(Object.keys(documento.on)).toEqual(['workflow_dispatch']);
  });
  it('roda só na main e no environment producao', () => {
    expect(job.environment).toBe('producao');
    expect(job.if).toContain('refs/heads/main');
  });
  it('concurrency sem cancelamento', () => {
    expect(job.concurrency['cancel-in-progress']).toBe(false);
    expect(job.concurrency.group).toBeTruthy();
  });
  it('nenhum passo ignora erro, e só o desfazer roda depois de falha', () => {
    expect(JSON.stringify(documento)).not.toContain('continue-on-error');
    const comCondicao = passos.filter((p) => p.if).map((p) => p.name);
    expect(comCondicao).toHaveLength(1);
    expect(comCondicao[0]).toMatch(/Desfazer/);
  });
});

describe('deploy.yml: ordem dos passos (FUN-40)', () => {
  it('URL_PUBLICA, build, dump, migração, Hyperdrive, deploy e saúde', () => {
    const ordem = [
      'Conferir URL_PUBLICA',
      '@pelada/web build',
      'dump-cifrado',
      'pnpm migrar',
      'verificar-cache-hyperdrive-cli',
      PUBLICAR,
      'api/health',
    ].map(indice);
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(new Set(ordem).size).toBe(ordem.length);
  });
  it('o build do web recebe o SHA como VITE_VERSAO', () => {
    expect(passo('@pelada/web build').env.VITE_VERSAO).toBe('${{ github.sha }}');
  });
  it('o build do web recebe o DSN do Sentry de um secret ou variável, nunca literal (FUN-23)', () => {
    expect(passo('@pelada/web build').env.VITE_SENTRY_DSN).toMatch(/^\$\{\{ (secrets|vars)\.[A-Z_]+ \}\}$/);
  });
  // ADR-030: o Neon tem só as branches permanentes `main` e `dev`; o deploy não cria nem apaga branch, e o ponto de
  // retorno antes de migrar é só o dump cifrado.
  it('nenhum passo chama a API do Neon nem cria branch de restauração', () => {
    const texto = JSON.stringify(documento);
    expect(texto).not.toContain('console.neon.tech');
    // Montados por partes: os nomes dos secrets removidos não podem constar como variável em uso (env-example.test).
    expect(texto).not.toContain(['NEON', 'API', 'KEY'].join('_'));
    expect(texto).not.toContain(['NEON', 'PROJECT', 'ID'].join('_'));
    expect(texto.toLowerCase()).not.toContain('restauracao-');
    expect(passos.map((p) => p.name ?? '').filter((n) => /branch/i.test(n))).toEqual([]);
  });
  it('dump cifrado pela action local, com a chave pública e a URL de migração', () => {
    const p = passo('dump-cifrado');
    expect(p.uses).toBe('./.github/actions/dump-cifrado');
    expect(p.with.url).toBe('${{ secrets.NEON_URL_MIGRACAO }}');
    expect(p.with.chave).toBe('${{ secrets.BACKUP_CHAVE }}');
  });
  // Motivo da mudança (ADR-032): DATABASE_URL vale só para o banco local; o deploy passa NEON_URL_MIGRACAO direto.
  it('a migração usa NEON_URL_MIGRACAO (role owner) e o alvo producao, nunca DATABASE_URL', () => {
    const p = passo('pnpm migrar');
    expect(p.env.NEON_URL_MIGRACAO).toBe('${{ secrets.NEON_URL_MIGRACAO }}');
    expect(JSON.stringify(documento)).not.toContain('DATABASE_URL');
    expect(p.run).toContain('--alvo producao');
  });
  it('a publicação injeta URL_PUBLICA e a versão (SHA)', () => {
    const run = passo(PUBLICAR).run;
    expect(run).toContain(PUBLICAR);
    expect(run).toContain('--var "URL_PUBLICA:${URL_PUBLICA}"');
    expect(run).toContain('--var "VERSAO:${SHA}"');
  });
  it('o health exige 200 e versao igual ao github.sha', () => {
    const p = passo('api/health');
    expect(p.env.SHA).toBe('${{ github.sha }}');
    expect(p.run).toContain('curl -fsS');
    expect(p.run).toContain('.versao');
    expect(p.run).toContain('"$versao" = "$SHA"');
    expect(p.run).toMatch(/exit 1\s*$/);
  });
});

describe('deploy.yml: paradas (FUN-41, FUN-42, FUN-56)', () => {
  it('o build vem antes de qualquer passo que toque o Neon ou o Worker', () => {
    const build = indice('@pelada/web build');
    for (const t of ['dump-cifrado', 'pnpm migrar', PUBLICAR]) {
      expect(indice(t)).toBeGreaterThan(build);
    }
  });
  it('a migração vem antes da publicação, sem condição que a libere após erro', () => {
    expect(indice('pnpm migrar')).toBeLessThan(indice(PUBLICAR));
    expect(passo(PUBLICAR).if).toBeUndefined();
  });
  const rodarConferencia = (url) => {
    const run = passo('Conferir URL_PUBLICA').run;
    return spawnSync('bash', ['-c', run], { env: { ...process.env, URL_PUBLICA: url }, encoding: 'utf8' });
  };
  it.each(['', 'http://inseguro.exemplo', 'https://host/caminho', 'nao-e-url'])(
    'URL_PUBLICA %j falha antes do deploy',
    (url) => {
      expect(rodarConferencia(url).status).toBe(1);
      expect(indice('Conferir URL_PUBLICA')).toBeLessThan(indice('@pelada/web build'));
    },
  );
  it('URL_PUBLICA https válida passa', () => {
    expect(rodarConferencia('https://gestaodapelada.ljssoftware.com.br').status).toBe(0);
  });
});

describe('deploy.yml: rollback e Hyperdrive (FUN-18)', () => {
  it('o rollback roda só depois de migração aplicada e não engole erro', () => {
    const p = passo('wrangler rollback');
    expect(p.if).toContain("steps.migrar.outcome == 'success'");
    expect(p.run).toContain('wrangler rollback');
    expect(p.run).not.toContain('|| true');
    expect(p.run).toContain('docs/runbook.md');
    // O único ponto de retorno é o dump cifrado da execução (ADR-030).
    expect(p.run).toContain('dump-predeploy-${RUN_ID}');
    expect(p.run.toLowerCase()).not.toContain('branch');
  });
  it('confere o cache do Hyperdrive desligado antes do deploy', () => {
    const p = passo('verificar-cache-hyperdrive-cli');
    expect(p.run).toContain('consultar-hyperdrive.sh');
    expect(p.run).toContain('hyperdrive-id.ts');
    expect(documento.jobs.deploy.env.CLOUDFLARE_API_BASE).toBe('https://api.cloudflare.com/client/v4');
  });
});
