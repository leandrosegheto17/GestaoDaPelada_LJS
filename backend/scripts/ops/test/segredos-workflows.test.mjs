import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

// SEC-001 (seguranca.md): secret no nível do repositório vale para qualquer workflow de qualquer branch, então todo
// job que lê um secret além do GITHUB_TOKEN declara um environment (com branch policy só `main`, criado na T47). O
// backup roda no environment `backup`; o deploy, no `producao`. Lê o YAML pela estrutura, nunca por texto.
const PASTA = fileURLToPath(new URL('../../../../.github/workflows/', import.meta.url));
const workflows = readdirSync(PASTA)
  .filter((nome) => /\.ya?ml$/i.test(nome))
  .map((nome) => ({ nome, documento: yaml.load(readFileSync(join(PASTA, nome), 'utf8')) }));

const SECRET = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;
const segredosDoJob = (job) =>
  [...new Set([...JSON.stringify(job).matchAll(SECRET)].map((m) => m[1]))].filter((s) => s !== 'GITHUB_TOKEN');
const ambienteDo = (job) => (typeof job.environment === 'object' ? job.environment?.name : job.environment);

const jobs = workflows.flatMap(({ nome, documento }) =>
  Object.entries(documento.jobs ?? {}).map(([id, job]) => ({ nome, id, job })),
);

describe('segredos só em environment protegido (SEC-001)', () => {
  it('encontra os três workflows', () => {
    expect(workflows.map((w) => w.nome).sort()).toEqual(['backup.yml', 'ci.yml', 'deploy.yml']);
  });

  it('todo job que usa secret (exceto GITHUB_TOKEN) declara environment', () => {
    const semAmbiente = jobs
      .filter(({ job }) => segredosDoJob(job).length > 0 && !ambienteDo(job))
      .map(({ nome, id, job }) => `${nome}:${id} (${segredosDoJob(job).join(', ')})`);
    expect(semAmbiente).toEqual([]);
  });

  it('o backup roda no environment backup', () => {
    const backup = workflows.find((w) => w.nome === 'backup.yml').documento.jobs.backup;
    expect(ambienteDo(backup)).toBe('backup');
    expect(segredosDoJob(backup).sort()).toEqual(['BACKUP_CHAVE', 'NEON_URL_BACKUP']);
  });

  it('os segredos de deploy só aparecem no job do environment producao', () => {
    const DEPLOY = ['NEON_URL_MIGRACAO', 'NEON_API_KEY', 'NEON_PROJECT_ID', 'CLOUDFLARE_API_TOKEN'];
    const fora = jobs
      .filter(({ job }) => ambienteDo(job) !== 'producao')
      .flatMap(({ nome, id, job }) =>
        segredosDoJob(job)
          .filter((s) => DEPLOY.includes(s))
          .map((s) => `${nome}:${id} ${s}`),
      );
    expect(fora).toEqual([]);
  });

  it('o CI não usa secret além do GITHUB_TOKEN', () => {
    const ci = jobs.filter((j) => j.nome === 'ci.yml');
    expect(ci.flatMap(({ job }) => segredosDoJob(job))).toEqual([]);
  });
});
