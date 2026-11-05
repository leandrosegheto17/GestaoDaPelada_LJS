import { arquivosDoRepositorio, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `wrangler-unico` (FUN-45, AD-004): o comando que publica o Worker (o subcomando
 * `deploy` do wrangler, o antigo `publish` e o `versions deploy`) só aparece em
 * `.github/workflows/deploy.yml`. Script do `package.json`, `.mjs`, `.ts` ou outro workflow
 * que publique reprova: o deploy da prévia tem um caminho só, com o environment `producao`.
 *
 * Documentação pode citar o comando: `docs/`, `.specs/`, `.claude/`, `.rascunho/` e `*.md`.
 *
 * O padrão usa `\s+` entre as palavras de propósito: o texto deste arquivo não contém o comando
 * e a checagem passa sobre si mesma.
 */

export const UNICO_PERMITIDO = '.github/workflows/deploy.yml';

const PUBLICA = /\bwrangler(?:\s+versions)?\s+(?:deploy|publish)\b/i;

const PASTAS_DE_DOCUMENTACAO: readonly string[] = ['docs/', '.specs/', '.claude/', '.rascunho/'];

export function documentacao(caminho: string): boolean {
  const c = caminho.replace(/\/g, '/');
  return c.toLowerCase().endsWith('.md') || PASTAS_DE_DOCUMENTACAO.some((p) => c.startsWith(p));
}

/** Uma linha por ocorrência fora do `deploy.yml`: `caminho:linha: publica o Worker`. */
export function checarWrangler(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    const c = caminho.replace(/\/g, '/');
    if (c === UNICO_PERMITIDO || documentacao(c)) continue;
    if (conteudo.includes('\u0000')) continue;
    conteudo.split('\n').forEach((linha, i) => {
      if (PUBLICA.test(linha)) problemas.push(`${c}:${i + 1}: publica o Worker; o único lugar permitido é ${UNICO_PERMITIDO}`);
    });
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarWrangler(arquivosDoRepositorio());
  for (const p of problemas) console.error(`wrangler-unico: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
