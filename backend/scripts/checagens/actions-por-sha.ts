import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Checagem `actions-por-sha` (FUN-40): todo `uses:` de workflow ou de action composta aponta
 * para um commit fixo (SHA de 40 caracteres hexadecimais). Tag ou branch (`@v4`, `@main`)
 * reprova, porque quem controla a tag pode trocar o código que roda com os nossos secrets.
 *
 * Passam também a action local (`./...`) e a imagem Docker com digest (`docker://...@sha256:`).
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');

const SHA = /^[0-9a-f]{40}$/;

export interface Arquivo {
  /** Caminho relativo à raiz, com `/`. */
  caminho: string;
  conteudo: string;
}

/** Motivo da reprovação de uma referência de `uses:`; `null` quando ela passa. */
export function problemaDoUses(referencia: string): string | null {
  const ref = referencia.trim().replace(/^['"]|['"]$/g, '');
  if (ref.startsWith('./')) return null;
  if (ref.startsWith('docker://')) {
    return /@sha256:[0-9a-f]{64}$/.test(ref) ? null : 'imagem Docker sem digest @sha256';
  }
  const arroba = ref.lastIndexOf('@');
  if (arroba < 0) return 'sem versão (@<sha>)';
  const versao = ref.slice(arroba + 1);
  return SHA.test(versao) ? null : `versão "${versao}" não é um SHA de 40 caracteres`;
}

/** Uma linha por `uses:` reprovado: `caminho:linha: uses <ref>: <motivo>`. */
export function checarActions(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho, conteudo } of arquivos) {
    conteudo.split('\n').forEach((linha, i) => {
      const achado = /^\s*(?:-\s*)?uses\s*:\s*([^\s#]+)/.exec(linha);
      if (!achado?.[1]) return;
      const motivo = problemaDoUses(achado[1]);
      if (motivo) problemas.push(`${caminho}:${i + 1}: uses ${achado[1]}: ${motivo}`);
    });
  }
  return problemas;
}

function listarYaml(pasta: string): string[] {
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return [];
  }
  return nomes.flatMap((n) => {
    const caminho = join(pasta, n);
    if (statSync(caminho).isDirectory()) return listarYaml(caminho);
    return /\.ya?ml$/.test(n) ? [caminho] : [];
  });
}

/** Os workflows e as actions compostas de `.github/`. */
export function arquivosDoGithub(raiz = RAIZ): Arquivo[] {
  return [
    ...listarYaml(join(raiz, '.github', 'workflows')),
    ...listarYaml(join(raiz, '.github', 'actions')),
  ].map((caminho) => ({
    caminho: relative(raiz, caminho).replace(/\\/g, '/'),
    conteudo: readFileSync(caminho, 'utf8'),
  }));
}

if (import.meta.main) {
  const problemas = checarActions(arquivosDoGithub());
  for (const p of problemas) console.error(`actions-por-sha: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
