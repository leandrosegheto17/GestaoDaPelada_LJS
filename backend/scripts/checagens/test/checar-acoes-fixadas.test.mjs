import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '..', 'checar-acoes-fixadas.mjs');
const SHA = '11d5960a326750d5838078e36cf38b85af677262';
const POLITICA = 'blockExoticSubdeps: true\nminimumReleaseAge: 1440\ntrustPolicy: no-downgrade\n';
const temporarias = [];

function repositorio(arquivos, comPolitica = true) {
  const raiz = mkdtempSync(join(tmpdir(), 'acoes-'));
  temporarias.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  const todos = comPolitica ? { 'pnpm-workspace.yaml': POLITICA, ...arquivos } : arquivos;
  for (const [nome, texto] of Object.entries(todos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (raiz, ambiente = process.env) =>
  spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8', env: ambiente });

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-acoes-fixadas', () => {
  it.each([
    ['ação por SHA', { '.github/workflows/a.yml': `      - uses: actions/cache@${SHA} # v4\n` }],
    ['ação local', { '.github/workflows/a.yml': '      - uses: ./.github/actions/x\n' }],
    ['action composta por SHA', { '.github/actions/x/action.yml': `    - uses: a/b@${SHA}\n` }],
    ['uses entre aspas por SHA', { '.github/workflows/a.yml': `      - uses: "a/b@${SHA}"\n` }],
  ])('passa: %s', (_nome, arquivos) => {
    expect(rodar(repositorio(arquivos)).status).toBe(0);
  });

  it.each([
    ['tag', { '.github/workflows/a.yml': '      - uses: actions/checkout@v4\n' }],
    ['branch', { '.github/workflows/a.yml': '      - uses: a/b@main\n' }],
    ['sem versão', { '.github/workflows/a.yml': '      - uses: a/b\n' }],
    ['SHA curto', { '.github/workflows/a.yml': '      - uses: a/b@11d5960\n' }],
    ['entre aspas com tag', { '.github/workflows/a.yml': '      - uses: "a/b@v1"\n' }],
    ['docker sem digest', { '.github/workflows/a.yml': '      - uses: docker://alpine:3\n' }],
    ['action composta com tag', { '.github/actions/x/action.yml': '    - uses: a/b@v2\n' }],
    ['step em chave própria', { '.github/workflows/a.yml': '        uses: a/b@v2\n' }],
    ['local que sai da raiz', { '.github/workflows/a.yml': '      - uses: ./../x\n' }],
    ['local com .. dentro de actions', { '.github/workflows/a.yml': '      - uses: ./.github/actions/../../../x\n' }],
    ['uses em flow style', { '.github/workflows/a.yml': '      - {uses: a/b@v3}\n' }],
  ])('falha: %s', (_nome, arquivos) => {
    const r = rodar(repositorio(arquivos));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/\.github\/.*\.yml:1: /);
  });

  it.each([
    [
      'checkout sem persist-credentials',
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n`,
      /\.github\/workflows\/a\.yml:4: .*sem persist-credentials: false/,
    ],
    [
      'checkout com persist-credentials true',
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          persist-credentials: true\n`,
      /sem persist-credentials: false/,
    ],
    [
      'checkout só com fetch-depth',
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          fetch-depth: 0\n`,
      /sem persist-credentials: false/,
    ],
    [
      'checkout em flow style',
      `jobs:\n  a:\n    steps:\n      - {uses: "actions/checkout@${SHA}"}\n`,
      /sem persist-credentials: false/,
    ],
    ['workflow reutilizável por tag', 'jobs:\n  a:\n    uses: org/repo/.github/workflows/x.yml@v1\n', /x\.yml@v1/],
    ['uses que não é texto', 'jobs:\n  a:\n    steps:\n      - uses: [a, b]\n', /uses que não é texto/],
    ['YAML inválido', 'jobs:\n  a: [\n', /YAML ilegível/],
    ['chave duplicada', `jobs:\n  a:\n    steps:\n      - uses: a/b@${SHA}\n        uses: a/b@v1\n`, /YAML ilegível/],
  ])('falha: %s', (_nome, texto, esperado) => {
    const r = rodar(repositorio({ '.github/workflows/a.yml': texto }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(esperado);
  });

  it.each([
    [
      'checkout com persist-credentials false',
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          persist-credentials: false\n`,
    ],
    [
      'checkout com persist-credentials "false"',
      `jobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA}\n        with:\n          persist-credentials: 'false'\n`,
    ],
    ['uses só em comentário', 'jobs:\n  a:\n    steps:\n      # - uses: a/b@v1\n      - run: echo ok\n'],
    ['uses só em texto de run', 'jobs:\n  a:\n    steps:\n      - run: \'echo "uses: a/b@v1"\'\n'],
    ['action composta sem checkout', `runs:\n  using: composite\n  steps:\n    - uses: a/b@${SHA}\n`],
  ])('passa: %s', (_nome, texto) => {
    const r = rodar(repositorio({ '.github/workflows/a.yml': texto }));
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it.each([
    ['blockExoticSubdeps', 'minimumReleaseAge: 1440\ntrustPolicy: no-downgrade\n'],
    ['blockExoticSubdeps', 'blockExoticSubdeps: false\nminimumReleaseAge: 1440\ntrustPolicy: no-downgrade\n'],
    ['trustPolicy', 'blockExoticSubdeps: true\nminimumReleaseAge: 1440\n'],
    ['trustPolicy', 'blockExoticSubdeps: true\nminimumReleaseAge: 1440\ntrustPolicy: off\n'],
    ['minimumReleaseAge', 'blockExoticSubdeps: true\ntrustPolicy: no-downgrade\n'],
  ])('pnpm-workspace sem %s falha', (chave, texto) => {
    const r = rodar(repositorio({ 'pnpm-workspace.yaml': texto, '.github/workflows/a.yml': `- uses: ./x\n` }, false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`pnpm-workspace.yaml:1: falta ${chave}`);
  });

  it('pnpm-workspace.yaml ausente falha fechado', () => {
    const r = rodar(repositorio({ '.github/workflows/a.yml': '- uses: ./x\n' }, false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pnpm-workspace.yaml:1: arquivo ausente');
  });

  it('sem git no PATH falha fechado com código 2', () => {
    const raiz = repositorio({ '.github/workflows/a.yml': '- uses: ./x\n' });
    expect(rodar(raiz, { ...process.env, PATH: '' }).status).toBe(2);
  });

  it('o repositório real está verde', () => {
    expect(rodar(resolve(import.meta.dirname, '../../../..')).status).toBe(0);
  });
});
