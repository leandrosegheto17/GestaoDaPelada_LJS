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

// Toda ocorrência do contexto `secrets` numa expressão `${{ }}` conta: `secrets.NOME` e `secrets['NOME']` dão o nome;
// qualquer outra forma (`toJSON(secrets)`, índice calculado) e `secrets: inherit` contam como todos (TODOS).
const TODOS = '(todos os secrets)';
const EXPRESSAO = /\$\{\{([\s\S]*?)\}\}/g;
const CONTEXTO = /(?<![\w-])(?<!\.\s*)\bsecrets\b(?:\s*\.\s*([A-Za-z_][\w-]*)|\s*\[\s*(['"])([^'"\]]+)\2\s*\])?/gi;
const textosDe = (valor) =>
  typeof valor === 'string'
    ? [valor]
    : valor && typeof valor === 'object'
      ? Object.values(valor).flatMap(textosDe)
      : [];
const segredosDoJob = (job) => {
  const nomes = new Set(job?.secrets === 'inherit' ? [TODOS] : []);
  for (const texto of textosDe(job)) {
    for (const [, expressao] of texto.matchAll(EXPRESSAO)) {
      for (const m of expressao.matchAll(CONTEXTO)) nomes.add(m[1] ?? m[3] ?? TODOS);
    }
  }
  return [...nomes].filter((s) => s.toUpperCase() !== 'GITHUB_TOKEN');
};
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

// SEC-010 (reteste): a guarda reconhecia só `secrets.NOME`. Qualquer `secrets` dentro de `${{ }}` (índice, `toJSON`,
// `format`) e o `secrets: inherit` de workflow reutilizável também contam como uso de secret.
describe('reconhece toda forma de uso de secret (SEC-010)', () => {
  const semAmbiente = (job) => segredosDoJob(job).length > 0 && !ambienteDo(job);

  it.each([
    ['índice com aspas simples', { steps: [{ run: 'x', env: { U: "${{ secrets['NEON_URL_BACKUP'] }}" } }] }],
    ['índice com aspas duplas', { steps: [{ run: 'x', env: { U: '${{ secrets["NEON_URL_BACKUP"] }}' } }] }],
    ['toJSON(secrets)', { steps: [{ run: 'echo "${{ toJSON(secrets) }}"' }] }],
    ['índice calculado', { steps: [{ run: 'x', env: { U: "${{ secrets[format('NEON_{0}', 'URL')] }}" } }] }],
    ['com espaços antes do ponto', { steps: [{ with: { t: '${{ secrets .NEON_API_KEY }}' } }] }],
    ['secrets: inherit', { uses: './.github/workflows/x.yml', secrets: 'inherit' }],
    ['secrets explícitos de workflow reutilizável', { uses: './x.yml', secrets: { k: '${{ secrets.NEON_API_KEY }}' } }],
  ])('job sem environment usando secret por %s é acusado', (_nome, job) => {
    expect(semAmbiente(job)).toBe(true);
    expect(semAmbiente({ ...job, environment: 'producao' })).toBe(false);
  });

  it('o nome do secret por índice é reconhecido como o de secrets.NOME', () => {
    const job = { steps: [{ env: { a: "${{ secrets['NEON_API_KEY'] }}", b: '${{ secrets.BACKUP_CHAVE }}' } }] };
    expect(segredosDoJob(job).sort()).toEqual(['BACKUP_CHAVE', 'NEON_API_KEY']);
  });

  it.each([
    ['só o GITHUB_TOKEN', { steps: [{ with: { token: '${{ secrets.GITHUB_TOKEN }}' } }] }],
    ['GITHUB_TOKEN por índice', { steps: [{ with: { token: "${{ secrets['GITHUB_TOKEN'] }}" } }] }],
    ['a palavra fora de expressão', { steps: [{ name: 'Confere secrets', run: 'echo "sem secrets aqui"' }] }],
  ])('não acusa %s', (_nome, job) => {
    expect(segredosDoJob(job)).toEqual([]);
  });
});
