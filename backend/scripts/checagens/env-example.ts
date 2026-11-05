import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arquivosDoRepositorio, RAIZ, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `env-example` (FUN-46): toda variável de ambiente lida pelo código ou citada pelos
 * workflows (secrets e vars do GitHub) está no `.env.example`, e cada linha do `.env.example`
 * tem, no comentário logo acima, `obrigatória:`, `formato:` e `segredo:` preenchidos. Variável
 * marcada como segredo nunca tem valor no arquivo.
 *
 * Fica de fora o que não é configuração do projeto: as variáveis do ambiente de execução (CI,
 * GitHub Actions, Node, Vite) e os bindings do Worker declarados no `wrangler.jsonc` (Hyperdrive
 * e limites de taxa), que chegam pelo `env` do Worker mas não são variáveis.
 */

export interface Variavel {
  nome: string;
  valor: string;
  /** Comentário da linha de cima, sem o `#`; vazio se não houver. */
  comentario: string;
  linha: number;
}

/** Nomes do ambiente de execução, nunca configurados pelo projeto. */
export const DO_AMBIENTE: ReadonlySet<string> = new Set([
  'CI',
  'NODE_ENV',
  'HOME',
  'PATH',
  'MODE',
  'DEV',
  'PROD',
  'SSR',
  'BASE_URL',
  'GITHUB_TOKEN',
]);

const PREFIXOS_DO_AMBIENTE = ['GITHUB_', 'RUNNER_'];

/** Leitura de variável no código: o objeto `env` (de `process`, `import.meta` ou do Worker). */
const LEITURAS: readonly RegExp[] = [/\benv\.([A-Z][A-Z0-9_]*)\b/g, /\benv\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g];

/** Citação nos workflows: `secrets.X` e `vars.X`. */
const DO_GITHUB: readonly RegExp[] = [/\bsecrets\.([A-Z][A-Z0-9_]*)\b/g, /\bvars\.([A-Z][A-Z0-9_]*)\b/g];

const CODIGO = /\.(?:ts|tsx|mts|cts|mjs|cjs|js)$/;
const WORKFLOW = /^\.github\/.+\.ya?ml$/;
const FORA: readonly string[] = ['.specs/', '.claude/', '.rascunho/', 'docs/'];

export function doAmbiente(nome: string): boolean {
  return DO_AMBIENTE.has(nome) || PREFIXOS_DO_AMBIENTE.some((p) => nome.startsWith(p));
}

/** Lê o `.env.example`: cada `NOME=valor` com o comentário da linha anterior. */
export function lerEnvExample(texto: string): Variavel[] {
  const linhas = texto.split(/\r?\n/);
  const variaveis: Variavel[] = [];
  linhas.forEach((linha, i) => {
    const achado = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha.trim());
    if (!achado?.[1]) return;
    const anterior = linhas[i - 1]?.trim() ?? '';
    variaveis.push({
      nome: achado[1],
      valor: (achado[2] ?? '').trim(),
      comentario: anterior.startsWith('#') ? anterior.replace(/^#\s*/, '') : '',
      linha: i + 1,
    });
  });
  return variaveis;
}

/** Valor de um campo do comentário (`obrigatória: sim | formato: ... | segredo: não`). */
export function campo(comentario: string, nome: 'obrigatória' | 'formato' | 'segredo'): string {
  for (const parte of comentario.split('|')) {
    const [chave, ...resto] = parte.split(':');
    if (chave?.trim().toLowerCase() === nome) return resto.join(':').trim();
  }
  return '';
}

/** Problemas de marcação do `.env.example`, um por linha. */
export function checarMarcacao(variaveis: readonly Variavel[]): string[] {
  const problemas: string[] = [];
  for (const v of variaveis) {
    for (const nome of ['obrigatória', 'formato', 'segredo'] as const) {
      if (!campo(v.comentario, nome)) problemas.push(`.env.example:${v.linha}: ${v.nome} sem "${nome}:" no comentário de cima`);
    }
    const segredo = campo(v.comentario, 'segredo').toLowerCase();
    if (segredo && segredo !== 'sim' && segredo !== 'não') {
      problemas.push(`.env.example:${v.linha}: ${v.nome} com "segredo: ${segredo}"; use sim ou não`);
    }
    if (segredo === 'sim' && v.valor !== '') {
      problemas.push(`.env.example:${v.linha}: ${v.nome} é segredo e tem valor; deixe vazio`);
    }
  }
  return problemas;
}

/** Nomes usados no código e nos workflows, com o primeiro lugar onde aparecem. */
export function variaveisUsadas(arquivos: readonly Arquivo[]): Map<string, string> {
  const usadas = new Map<string, string>();
  for (const { caminho, conteudo } of arquivos) {
    const c = caminho.replace(/\/g, '/');
    if (FORA.some((p) => c.startsWith(p))) continue;
    const padroes = CODIGO.test(c) ? LEITURAS : WORKFLOW.test(c) ? [...LEITURAS, ...DO_GITHUB] : [];
    if (padroes.length === 0) continue;
    conteudo.split('\n').forEach((linha, i) => {
      for (const re of padroes) {
        for (const m of linha.matchAll(re)) {
          const nome = m[1];
          if (nome && !usadas.has(nome)) usadas.set(nome, `${c}:${i + 1}`);
        }
      }
    });
  }
  return usadas;
}

/** Bindings do Worker no `wrangler.jsonc` (não são variáveis de ambiente). */
export function bindingsDoWrangler(texto: string): Set<string> {
  const nomes = new Set<string>();
  for (const m of texto.matchAll(/"(?:binding|name)"\s*:\s*"([A-Z][A-Z0-9_]*)"/g)) if (m[1]) nomes.add(m[1]);
  return nomes;
}

export function checarEnvExample(arquivos: readonly Arquivo[], envExample: string, bindings: ReadonlySet<string> = new Set()): string[] {
  const variaveis = lerEnvExample(envExample);
  const listadas = new Set(variaveis.map((v) => v.nome));
  const problemas = checarMarcacao(variaveis);
  for (const [nome, onde] of variaveisUsadas(arquivos)) {
    if (doAmbiente(nome) || bindings.has(nome) || listadas.has(nome)) continue;
    problemas.push(`${onde}: ${nome} é usada e não está no .env.example`);
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarEnvExample(
    arquivosDoRepositorio(),
    readFileSync(join(RAIZ, '.env.example'), 'utf8'),
    bindingsDoWrangler(readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8')),
  );
  for (const p of problemas) console.error(`env-example: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
