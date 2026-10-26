import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '..', 'checar-wrangler-deploy.mjs');
const temporarias = [];

function repositorio(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'wrangler-'));
  temporarias.push(raiz);
  execFileSync('git', ['init', '-q'], { cwd: raiz });
  for (const [nome, texto] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, nome)), { recursive: true });
    writeFileSync(join(raiz, nome), texto);
  }
  return raiz;
}

const rodar = (raiz, ambiente = process.env) =>
  spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8', env: ambiente }).status;

afterEach(() => {
  while (temporarias.length) rmSync(temporarias.pop(), { recursive: true, force: true });
});

describe('checar-wrangler-deploy (FUN-43)', () => {
  it.each([
    ['.github/workflows/ci.yml', '      - run: pnpm exec wrangler deploy\n'],
    ['package.json', '{ "scripts": { "publicar": "wrangler deploy --env teste" } }\n'],
    ['scripts/publicar.sh', 'wrangler \\\n  deploy\n'],
    ['scripts/a.sh', 'npx wrangler@3 deploy\n'],
    ['.github/workflows/outro.yml', '      - run: pnpm exec wrangler  deploy --env teste\n'],
    ['scripts/b.mjs', "execSync('wrangler versions deploy');\n"],
    [
      '.github/workflows/ci.yml',
      '      - run: pnpm --filter @pelada/api exec wrangler deploy -c ../../wrangler.jsonc\n',
    ],
    ['scripts/d.sh', 'pnpm --filter @pelada/api exec wrangler versions deploy -c ../../wrangler.jsonc\n'],
    ['scripts/e.sh', 'wrangler -c x.jsonc deploy\n'],
    ['.github/workflows/outro.yml', '      - run: wrangler --env p deploy\n'],
    ['scripts/f.sh', 'pnpm exec wrangler --config c deploy\n'],
    ['scripts/g.sh', 'wrangler pages deploy dist --project-name x\n'],
    ['.github/workflows/outro.yml', '      - run: pnpm exec wrangler triggers deploy\n'],
    ['scripts/h.sh', 'wrangler publish\n'],
    ['scripts/i.sh', 'wrangler -c x.jsonc publish\n'],
    ['scripts/j.sh', 'wrangler pages publish dist\n'],
    ['scripts/k.sh', 'wrangler --config "a b" deploy\n'],
    ['scripts/l.sh', "wrangler --config 'a b' pages deploy dist\n"],
    ['.github/workflows/outro.yml', '      - uses: cloudflare/wrangler-action@v3\n'],
    ['.github/workflows/outro.yml', '      - uses: "cloudflare/wrangler-action@v3"\n'],
    ['Dockerfile', 'RUN npx wrangler deploy\n'],
    ['docker/app.Dockerfile', 'RUN wrangler deploy\n'],
    ['Makefile', 'publicar:\n\twrangler deploy\n'],
    ['justfile', 'publicar:\n  wrangler deploy\n'],
    ['scripts/p.ps1', 'wrangler deploy --env p\n'],
    ['scripts/p.cmd', 'call wrangler deploy\n'],
    ['scripts/p.bat', 'wrangler deploy\n'],
    ['scripts/p.py', "subprocess.run(['wrangler deploy'], shell=True)\n"],
    ['scripts/q.cmd', 'wrangler.cmd deploy\n'],
    ['scripts/q.ps1', '.\\node_modules\\.bin\\wrangler.exe deploy\n'],
    ['scripts/q.sh', 'wrangler.cmd -c x.jsonc pages deploy dist\n'],
    ['.github/workflows/outro.yml', '      - uses: cloudflare/pages-action@v1\n'],
    ['.github/workflows/outro.yml', '      - uses: "cloudflare/pages-action@v1"\n'],
    ['scripts/P.BAT', 'wrangler deploy\n'],
    ['scripts/p.PS1', 'wrangler deploy\n'],
    ['.github/workflows/x.YML', '      - uses: cloudflare/pages-action@v1\n'],
    ['dockerfile', 'RUN wrangler deploy\n'],
    ['Justfile', 'publicar:\n  wrangler deploy\n'],
    ['GNUmakefile', 'publicar:\n\twrangler deploy\n'],
    ['.github/workflows/Deploy.yml', '      - run: wrangler deploy\n'],
    // Só o parser enxerga: bloco `run: |` com barra invertida, YAML ilegível (falha fechado), script de package.json.
    ['.github/workflows/outro.yml', '      - run: |\n          pnpm exec wrangler \\\n            deploy\n'],
    [
      '.github/workflows/outro.yml',
      '      - run: |\n          echo ok\n          pnpm exec wrangler pages deploy dist\n',
    ],
    ['.github/workflows/outro.yml', 'jobs:\n  a: [\n'],
    ['.github/workflows/outro.yml', '      - {uses: cloudflare/wrangler-action@v3}\n'],
    ['package.json', '{ "name": "x", "scripts": { "a": "echo ok", "b": "pnpm exec wrangler deploy" } }\n'],
    ['package.json', '{ "scripts": { "a": "x" '],
  ])('falha: %s', (nome, texto) => {
    expect(rodar(repositorio({ [nome]: texto }))).toBe(1);
  });

  it.each([
    ['.github/workflows/deploy.yml', '      - run: pnpm exec wrangler deploy\n'],
    [
      '.github/workflows/deploy.yml',
      '      - run: pnpm --filter @pelada/api exec wrangler deploy -c ../../wrangler.jsonc\n',
    ],
    ['backend/DEPLOY.md', 'Rode `wrangler deploy` no workflow.\n'],
    ['README.md', 'wrangler deploy\n'],
    ['package.json', '{ "scripts": { "local": "wrangler dev" } }\n'],
    ['scripts/c.sh', 'wrangler deployments list\n'],
    ['scripts/m.sh', 'wrangler versions upload\n'],
    ['scripts/n.sh', 'wrangler -c x.jsonc versions upload --tag a\n'],
    ['scripts/o.sh', 'wrangler pages project list\n'],
    ['.github/workflows/deploy.yml', '      - uses: cloudflare/wrangler-action@v3\n'],
    ['.github/workflows/deploy.yml', '      - uses: cloudflare/pages-action@v1\n'],
    ['docs/guia.txt', 'wrangler deploy\n'],
    ['Dockerfile', 'RUN npx wrangler versions upload\n'],
    ['scripts/r.ps1', 'wrangler.exe versions upload\n'],
    ['scripts/r.py', "print('wrangler deployments list')\n"],
    // O parser ignora comentário de YAML e texto de package.json que não é script.
    ['.github/workflows/outro.yml', '      # - run: wrangler deploy\n      - run: echo ok\n'],
    ['.github/workflows/outro.yml', '      - name: wrangler deploy\n        run: echo ok\n'],
    ['.github/workflows/outro.yml', "      - run: 'echo ok'\n        env:\n          DESCRICAO: wrangler deploy\n"],
    ['package.json', '{ "name": "x", "description": "usa wrangler deploy", "scripts": { "a": "echo ok" } }\n'],
  ])('passa: %s', (nome, texto) => {
    expect(rodar(repositorio({ [nome]: texto, 'src/ok.ts': 'export {};\n' }))).toBe(0);
  });

  it('linha longa e patológica não trava (sem ReDoS)', () => {
    const linha = `wrangler ${'-a b '.repeat(20000)}x\n${'wrangler "'.repeat(5000)}\n`;
    const inicio = Date.now();
    expect(rodar(repositorio({ 'scripts/p.sh': linha }))).toBe(0);
    expect(Date.now() - inicio).toBeLessThan(5000);
  });

  it('sem git no PATH falha fechado com código 2', () => {
    const raiz = repositorio({ 'src/ok.ts': 'export {};\n' });
    expect(rodar(raiz, { ...process.env, PATH: '' })).toBe(2);
  });

  it('o repositório real está verde', () => {
    expect(rodar(resolve(import.meta.dirname, '../../../..'))).toBe(0);
  });
});
