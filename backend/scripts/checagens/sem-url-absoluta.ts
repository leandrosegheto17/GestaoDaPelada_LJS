import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checagem `sem-url-absoluta` (FUN-23): o código e as migrações não citam o endereço do app.
 * A única fonte é a variável `URL_PUBLICA`, injetada no deploy. Reprova o domínio do LJS e o
 * endereço padrão da Cloudflare (`workers` + `.dev`) em qualquer arquivo versionado fora da lista permitida.
 *
 * Os padrões estão escritos com `\.` de propósito: o texto deste arquivo não contém os
 * domínios e a checagem passa sobre si mesma.
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');

export const PROIBIDOS: ReadonlyArray<[string, RegExp]> = [
  ['domínio do LJS', /ljssoftware\.com\.br/i],
  // O rótulo é montado para o texto deste arquivo não conter o domínio (a checagem passa sobre si mesma).
  ['workers' + '.dev', /workers\.dev/i],
];

/** Arquivos exatos que podem citar os domínios. */
export const ARQUIVOS_PERMITIDOS: ReadonlySet<string> = new Set([
  'wrangler.jsonc',
  '.env.example',
  // SPEC_DEVIATION: a spec lista só wrangler.jsonc, docs/, .specs/ e .env.example. O teste do
  // wrangler.jsonc (T33, FUN-27) cita o endereço padrão no nome de um caso; mudar um teste
  // existente pede aprovação, então o /executar decide entre manter esta linha ou renomear o caso.
  'test/wrangler.test.ts',
  // AD-121: a checagem so-previa guarda o único domínio próprio permitido, e o teste dela o cita.
  'backend/scripts/checagens/so-previa.ts',
  'backend/scripts/checagens/test/so-previa.test.ts',
]);

/** Pastas cujo conteúdo pode citar os domínios (documentação e planejamento). */
export const PASTAS_PERMITIDAS: readonly string[] = ['docs/', '.specs/'];

export interface Arquivo {
  /** Caminho relativo à raiz, com `/`. */
  caminho: string;
  conteudo: string;
}

export function permitido(caminho: string): boolean {
  const c = caminho.replace(/\\/g, '/');
  return ARQUIVOS_PERMITIDOS.has(c) || PASTAS_PERMITIDAS.some((p) => c.startsWith(p));
}

/** Uma linha por ocorrência: `caminho:linha: cita <termo>`. */
export function checarUrls(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (permitido(caminho)) continue;
    // Arquivo binário (fonte, imagem): não é código nem migração.
    if (conteudo.includes('\u0000')) continue;
    const linhas = conteudo.split('\n');
    linhas.forEach((linha, i) => {
      for (const [termo, re] of PROIBIDOS) {
        if (re.test(linha)) problemas.push(`${caminho}:${i + 1}: cita ${termo}; use a variável URL_PUBLICA`);
      }
    });
  }
  return problemas;
}

/** Os arquivos versionados do repositório (`git ls-files`), lidos da raiz. */
export function arquivosDoRepositorio(raiz = RAIZ): Arquivo[] {
  const saida = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' });
  return saida
    .split('\u0000')
    .filter((c) => c.length > 0)
    .map((caminho) => {
      let conteudo = '';
      try {
        conteudo = readFileSync(join(raiz, caminho), 'utf8');
      } catch {
        // Arquivo apagado na árvore de trabalho e ainda no índice: nada a conferir.
      }
      return { caminho, conteudo };
    });
}

if (import.meta.main) {
  const problemas = checarUrls(arquivosDoRepositorio());
  for (const p of problemas) console.error(`sem-url-absoluta: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
