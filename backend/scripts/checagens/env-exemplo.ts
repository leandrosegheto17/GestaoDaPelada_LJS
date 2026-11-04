import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');

const PASTAS_IGNORADAS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.wrangler',
  'test-results',
  '.specs',
  '.claude',
  '.rascunho',
  'docs',
]);
/** A checagem não lê a si mesma: os testes dela citam variáveis de mentira. */
const ARQUIVOS_IGNORADOS = /^backend\/scripts\/checagens\//;
const EXTENSOES = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.sh']);

/** Onde `env.NOME` (parâmetro ou `c.env`) é variável de ambiente, e não um objeto qualquer. */
const ONDE_ENV_PARAMETRO = /^(backend\/api\/src\/|backend\/scripts\/src\/|scripts\/)/;

/** Variáveis do sistema ou do Vite, bindings do Worker: não são configuração do projeto. */
const NAO_EXIGEM = [
  /^(PATH|CI|NODE_ENV|HOME|USERPROFILE|TEMP|TMP|TMPDIR|SHELL|MODE|DEV|PROD|SSR|BASE_URL)$/,
  /^(HYPERDRIVE|ASSETS)$/,
  /^LIMITE_/,
  /^(GITHUB|RUNNER)_/,
];

const NOME = '[A-Z][A-Z0-9_]*(?![A-Z0-9_])';
/** Atribuição (`=`, `||=`, `??=`), mas não comparação (`==`). */
const SEM_ATRIBUICAO = String.raw`(?!\s*(?:\|\||\?\?|&&)?=[^=])`;

function* arquivos(pasta: string): Generator<string> {
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!PASTAS_IGNORADAS.has(e.name)) yield* arquivos(join(pasta, e.name));
    } else if (EXTENSOES.has(extname(e.name))) {
      yield join(pasta, e.name);
    }
  }
}

function nomesNaLinha(linha: string, caminho: string): string[] {
  const nomes: string[] = [];
  const somar = (re: RegExp) => {
    for (const m of linha.matchAll(re)) if (m[1]) nomes.push(m[1]);
  };
  somar(new RegExp(String.raw`process\.env\.(${NOME})${SEM_ATRIBUICAO}`, 'g'));
  somar(new RegExp(String.raw`process\.env\[\s*['"](${NOME})['"]\s*\]`, 'g'));
  somar(new RegExp(String.raw`import\.meta\.env\.(${NOME})`, 'g'));
  if (/\.ya?ml$/.test(caminho)) somar(new RegExp(String.raw`\b(?:secrets|vars)\.(${NOME})`, 'g'));
  if (ONDE_ENV_PARAMETRO.test(caminho) && !/(^|\/)test\//.test(caminho)) {
    somar(new RegExp(String.raw`\benv\.(${NOME})${SEM_ATRIBUICAO}`, 'g'));
  }
  for (const m of linha.matchAll(/\{([^}]*)\}\s*=\s*process\.env\b/g)) {
    for (const parte of (m[1] ?? '').split(',')) {
      const nome = parte.split(/[:=]/)[0]?.trim() ?? '';
      if (/^[A-Z][A-Z0-9_]*$/.test(nome)) nomes.push(nome);
    }
  }
  return nomes;
}

/** Cada variável de ambiente usada no código e nos workflows, com o primeiro `arquivo:linha` em que aparece. */
export function variaveisUsadas(raiz: string): Map<string, string> {
  const usadas = new Map<string, string>();
  for (const arquivo of arquivos(raiz)) {
    const caminho = relative(raiz, arquivo).split(sep).join('/');
    if (ARQUIVOS_IGNORADOS.test(caminho)) continue;
    readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .forEach((linha, i) => {
        for (const nome of nomesNaLinha(linha, caminho)) {
          if (NAO_EXIGEM.some((p) => p.test(nome)) || usadas.has(nome)) continue;
          usadas.set(nome, `${caminho}:${i + 1}`);
        }
      });
  }
  return usadas;
}

interface Declarada {
  linha: number;
  valor: string;
  obrigatoria: boolean;
  formato: boolean;
  segredo: 'sim' | 'não' | undefined;
  comentario: string;
}

/** Lê o `.env.example`: cada variável traz, na linha de comentário logo acima, obrigatoriedade, formato e segredo. */
function declaradas(texto: string): Map<string, Declarada> {
  const mapa = new Map<string, Declarada>();
  const linhas = texto.split(/\r?\n/);
  linhas.forEach((linha, i) => {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha);
    if (!m) return;
    const anterior = linhas[i - 1] ?? '';
    const comentario = anterior.startsWith('#') ? anterior : '';
    const segredo = /segredo:\s*(sim|n[ãa]o)\b/i.exec(comentario)?.[1]?.toLowerCase();
    mapa.set(m[1] ?? '', {
      linha: i + 1,
      valor: (m[2] ?? '').trim(),
      obrigatoria: /obrigat[óo]ria:\s*(sim|n[ãa]o)\b/i.test(comentario),
      formato: /formato:\s*[^|\s]/i.test(comentario),
      segredo: segredo === undefined ? undefined : segredo === 'sim' ? 'sim' : 'não',
      comentario,
    });
  });
  return mapa;
}

/**
 * Exige que toda variável usada no código e nos workflows esteja no `.env.example` com obrigatoriedade, formato e
 * se é segredo (FUN-46), e que segredo nunca traga valor real no exemplo.
 */
export function checarEnvExemplo(op: { raiz: string }): Resultado {
  const violacoes: string[] = [];
  const caminhoExemplo = join(op.raiz, '.env.example');
  const exemplo = existsSync(caminhoExemplo)
    ? declaradas(readFileSync(caminhoExemplo, 'utf8'))
    : new Map();

  for (const [nome, onde] of variaveisUsadas(op.raiz)) {
    if (!exemplo.has(nome)) violacoes.push(`${nome} (usada em ${onde}) não está no .env.example`);
  }
  for (const [nome, d] of exemplo as Map<string, Declarada>) {
    const faltas = [
      d.obrigatoria ? '' : 'obrigatória: sim|não',
      d.formato ? '' : 'formato: <descrição>',
      d.segredo ? '' : 'segredo: sim|não',
    ].filter(Boolean);
    if (faltas.length > 0) {
      violacoes.push(
        `.env.example:${d.linha}: ${nome} sem a marcação "${faltas.join('", "')}" na linha de comentário acima`,
      );
    }
    if (d.segredo === 'sim' && d.valor !== '') {
      violacoes.push(`.env.example:${d.linha}: ${nome} é segredo e não pode ter valor no exemplo`);
    }
  }
  return { ok: violacoes.length === 0, violacoes };
}

if (import.meta.main) {
  const r = checarEnvExemplo({ raiz: RAIZ });
  if (r.ok) {
    console.log('.env.example completo: ok');
  } else {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
}
