// Critério: regra de CI sem FUN próprio (T5); ações fixadas por SHA.
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

  // SEC-004: imagem Docker por tag mutável pode ser trocada no registro e recebe as credenciais do job.
  const DIGEST = `sha256:${'a'.repeat(64)}`;
  describe('imagens Docker fixadas por digest (SEC-004)', () => {
    it.each([
      [
        'service por digest',
        { '.github/workflows/a.yml': `jobs:\n  a:\n    services:\n      pg:\n        image: postgres:16@${DIGEST}\n` },
      ],
      ['container por digest', { '.github/workflows/a.yml': `jobs:\n  a:\n    container: node:24@${DIGEST}\n` }],
      [
        'container em mapa por digest',
        { '.github/workflows/a.yml': `jobs:\n  a:\n    container:\n      image: node:24@${DIGEST}\n` },
      ],
      [
        'docker run por digest',
        { '.github/actions/x/x.sh': `docker run --rm -e PG_URL postgres:16@${DIGEST} \\\n  sh -c 'pg_dump'\n` },
      ],
      [
        'docker run com opção --x=y',
        { '.github/actions/x/x.sh': `docker run --network=host -i postgres:16@${DIGEST} psql\n` },
      ],
      ['docker run só em comentário', { '.github/actions/x/x.sh': '# docker run postgres:16\necho ok\n' }],
      // SEC-010 (reteste): outras formas de criar contêiner, também por digest.
      [
        'docker container run por digest',
        { '.github/actions/x/x.sh': `docker container run --rm postgres:16@${DIGEST}\n` },
      ],
      [
        'docker com opções globais por digest',
        { '.github/actions/x/x.sh': `docker --context ci --log-level error run --rm postgres:16@${DIGEST}\n` },
      ],
      ['docker create por digest', { '.github/actions/x/x.sh': `docker create --name pg postgres:16@${DIGEST}\n` }],
      ['podman run por digest', { '.github/actions/x/x.sh': `podman run --rm postgres:16@${DIGEST}\n` }],
      ['docker sem criar contêiner', { '.github/actions/x/x.sh': 'docker ps\ndocker image ls postgres\n' }],
    ])('passa: %s', (_nome, arquivos) => {
      const r = rodar(repositorio(arquivos));
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });

    it.each([
      [
        'service por tag',
        { '.github/workflows/a.yml': 'jobs:\n  a:\n    services:\n      pg:\n        image: postgres:16\n' },
        /a\.yml:5: .*postgres:16/,
      ],
      [
        'service em texto curto',
        { '.github/workflows/a.yml': 'jobs:\n  a:\n    services:\n      pg: postgres:16\n' },
        /postgres:16/,
      ],
      ['container por tag', { '.github/workflows/a.yml': 'jobs:\n  a:\n    container: node:24\n' }, /node:24/],
      [
        'container em mapa por tag',
        { '.github/workflows/a.yml': 'jobs:\n  a:\n    container:\n      image: node:24\n' },
        /node:24/,
      ],
      [
        'digest curto',
        { '.github/workflows/a.yml': 'jobs:\n  a:\n    container: node:24@sha256:abc\n' },
        /node:24@sha256:abc/,
      ],
      [
        'docker run por tag',
        { '.github/actions/x/x.sh': 'docker run --rm -e PG_URL postgres:16 \\\n  sh -c "pg_dump"\n' },
        /x\.sh:1: .*postgres:16/,
      ],
      [
        'docker run sem tag',
        { '.github/actions/x/x.sh': 'if ! docker run --rm postgres psql; then exit 1; fi\n' },
        /x\.sh:1: .*postgres/,
      ],
      [
        'docker run em script de workflow',
        { '.github/workflows/a.yml': 'jobs:\n  a:\n    steps:\n      - run: docker run --rm alpine:3 true\n' },
        /alpine:3/,
      ],
      // SEC-010 (reteste): formas equivalentes que a primeira versão da G-24 deixava passar.
      [
        'docker container run por tag',
        { '.github/actions/x/x.sh': 'docker container run --rm postgres:16 psql\n' },
        /x\.sh:1: .*postgres:16/,
      ],
      [
        'docker --context x run por tag',
        { '.github/actions/x/x.sh': 'docker --context x run --rm postgres:16 psql\n' },
        /postgres:16/,
      ],
      [
        'docker --log-level error run por tag',
        { '.github/actions/x/x.sh': 'docker --log-level error run --rm postgres:16 psql\n' },
        /postgres:16/,
      ],
      ['docker -D run por tag', { '.github/actions/x/x.sh': 'docker -D run --rm postgres:16\n' }, /postgres:16/],
      [
        'docker --host=x run por tag',
        { '.github/actions/x/x.sh': 'docker --host=tcp://h:2375 run postgres:16\n' },
        /postgres:16/,
      ],
      ['docker create por tag', { '.github/actions/x/x.sh': 'docker create --name pg postgres:16\n' }, /postgres:16/],
      [
        'docker container create por tag',
        { '.github/actions/x/x.sh': 'docker container create postgres:16\n' },
        /postgres:16/,
      ],
      ['podman run por tag', { '.github/actions/x/x.sh': 'podman run --rm postgres:16\n' }, /postgres:16/],
      [
        'docker --context x container run em workflow',
        {
          '.github/workflows/a.yml':
            'jobs:\n  a:\n    steps:\n      - run: docker --context x container run alpine:3\n',
        },
        /alpine:3/,
      ],
    ])('falha: %s', (_nome, arquivos, esperado) => {
      const r = rodar(repositorio(arquivos));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(esperado);
    });
  });

  it('o repositório real está verde', () => {
    expect(rodar(resolve(import.meta.dirname, '../../../..')).status).toBe(0);
  });
});
