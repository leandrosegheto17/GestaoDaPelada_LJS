import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

// Critério: FUN-44 (tasks.md, T41). O .env.example lista toda variável usada em código, wrangler.jsonc e workflows,
// com obrigatoriedade, formato e se é segredo, e não carrega valor.
const RAIZ = join(import.meta.dirname, '..', '..', '..');
const arquivos = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: RAIZ,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

// Fornecidas pelo sistema, pelo GitHub ou pelo runner de testes; não são configuração do projeto.
const DO_AMBIENTE = new Set(['CI', 'PATH', 'TZ', 'VITEST', 'GITHUB_TOKEN', 'NODE_ENV']);
// Embutidas do Vite (`import.meta.env.PROD` etc.).
const DO_VITE = new Set(['PROD', 'DEV', 'MODE', 'BASE_URL', 'SSR']);

const lerTexto = (caminho: string): string => readFileSync(join(RAIZ, caminho), 'utf8');
const codigo = arquivos.filter(
  (c) =>
    /\.(ts|tsx|mjs|js|sh)$/.test(c) &&
    !c.startsWith('.claude/') &&
    !c.startsWith('.specs/') &&
    c !== 'backend/scripts/test/env-example.test.ts',
);
const workflows = arquivos.filter((c) => /^\.github\/.*\.ya?ml$/.test(c));

function usadas(): Map<string, string> {
  const achadas = new Map<string, string>();
  const registrar = (nome: string, origem: string): void => {
    if (!DO_AMBIENTE.has(nome) && !DO_VITE.has(nome)) achadas.set(nome, achadas.get(nome) ?? origem);
  };
  const padroes = [
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
    /\b((?:CLOUDFLARE|VITE|PELADA|NEON)_[A-Z0-9_]+|DATABASE_URL(?:_TESTE)?|SENTRY_DSN|URL_PUBLICA|BACKUP_CHAVE)\b/g,
  ];
  for (const caminho of codigo) {
    const texto = lerTexto(caminho);
    for (const padrao of padroes) for (const m of texto.matchAll(padrao)) registrar(m[1] as string, caminho);
  }
  for (const caminho of workflows) {
    const texto = lerTexto(caminho);
    for (const m of texto.matchAll(/\b(?:secrets|vars)\.([A-Za-z0-9_]+)/g)) registrar(m[1] as string, caminho);
    for (const m of texto.matchAll(/\bVITE_[A-Z0-9_]+/g)) registrar(m[0], caminho);
  }
  // wrangler.jsonc: variáveis e nomes de binding do Worker.
  const wrangler = lerTexto('wrangler.jsonc');
  const vars = /"vars"\s*:\s*\{([^}]*)\}/.exec(wrangler)?.[1] ?? '';
  for (const m of vars.matchAll(/"([A-Z][A-Z0-9_]+)"\s*:/g)) registrar(m[1] as string, 'wrangler.jsonc');
  // Segredos do Worker declarados na interface de bindings.
  const env = lerTexto('backend/api/src/entrada/env.ts');
  for (const m of env.matchAll(/^\s+([A-Z][A-Z0-9_]+)\??:\s*string/gm)) registrar(m[1] as string, 'env.ts');
  return achadas;
}

interface Entrada {
  nome: string;
  valor: string;
  comentario: string;
}

function lerExemplo(): Entrada[] {
  const entradas: Entrada[] = [];
  let comentario = '';
  for (const linha of lerTexto('.env.example').split(/\r?\n/)) {
    const atribuicao = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha);
    if (atribuicao) {
      entradas.push({ nome: atribuicao[1] as string, valor: atribuicao[2] as string, comentario });
      comentario = '';
    } else if (linha.startsWith('#')) {
      comentario = linha;
    } else {
      comentario = '';
    }
  }
  return entradas;
}

describe('.env.example (FUN-44)', () => {
  const entradas = lerExemplo();
  const nomes = new Set(entradas.map((e) => e.nome));

  it('lista toda variável usada em código, wrangler.jsonc ou workflows', () => {
    const faltando = [...usadas()].filter(([nome]) => !nomes.has(nome)).map(([nome, onde]) => `${nome} (${onde})`);
    expect(faltando).toEqual([]);
  });

  it('não repete variável', () => {
    expect(entradas.length).toBe(nomes.size);
  });

  it('cada variável tem obrigatoriedade, formato e se é segredo', () => {
    const incompletas = entradas
      .filter(
        (e) =>
          !/Obrigatória:/.test(e.comentario) ||
          !/Formato:/.test(e.comentario) ||
          !/Segredo: (sim|não)/.test(e.comentario),
      )
      .map((e) => e.nome);
    expect(incompletas).toEqual([]);
  });

  it('não versiona valor: toda variável fica vazia', () => {
    expect(entradas.filter((e) => e.valor.trim() !== '').map((e) => e.nome)).toEqual([]);
  });

  it('constam SENTRY_DSN, URL_PUBLICA e os nomes reservados de Resend e Web Push', () => {
    for (const nome of ['SENTRY_DSN', 'URL_PUBLICA', 'RESEND_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
      expect(nomes.has(nome), nome).toBe(true);
    }
  });

  it('constam as variáveis da conta e acesso: RESEND_REMETENTE, EMAIL_DEV (não segredo) e SEED_SENHA_ADMIN (segredo)', () => {
    const porNome = new Map(entradas.map((e) => [e.nome, e]));
    for (const nome of ['RESEND_API_KEY', 'RESEND_REMETENTE', 'EMAIL_DEV', 'SEED_SENHA_ADMIN']) {
      expect(porNome.has(nome), nome).toBe(true);
    }
    expect(porNome.get('EMAIL_DEV')?.comentario).toMatch(/Segredo: não/);
    expect(porNome.get('SEED_SENHA_ADMIN')?.comentario).toMatch(/Segredo: sim/);
    expect(porNome.get('RESEND_API_KEY')?.comentario).toMatch(/Segredo: sim/);
  });

  it('o .dev.vars.example liga o EMAIL_DEV só para o desenvolvimento local', () => {
    expect(lerTexto('.dev.vars.example')).toMatch(/^EMAIL_DEV=1$/m);
  });

  it('o gitleaks fica configurado no CI', () => {
    const ci = yaml.load(lerTexto('.github/workflows/ci.yml')) as { jobs: { base: { steps: { uses?: string }[] } } };
    expect(ci.jobs.base.steps.some((p) => p.uses?.startsWith('gitleaks/gitleaks-action@'))).toBe(true);
  });
});
