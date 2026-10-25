import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXTENSOES = /\.(ts|tsx|mjs|cjs|js|jsx|json|jsonc|yml|yaml|css|html|sql|toml|sh|ps1|cmd|bat|py)$/i;
// Arquivos sem extensão (ou com a extensão no meio) que também executam comandos.
const NOMES = /(^|\/)(Dockerfile(\.[^/]*)?|[^/]*\.Dockerfile|(GNU)?Makefile|justfile)$/i;

/** Termina o processo com código 2 (falha fechado: ferramenta ausente ou entrada vazia). */
export function falharFechado(mensagem) {
  console.error(`ERRO: ${mensagem}`);
  process.exit(2);
}

/**
 * Lista os arquivos versionados de `raiz` que passam em `filtro(caminho)`, já lidos.
 * Qualquer falha (git ausente, leitura, lista vazia) é erro de código 2, nunca "sem achados".
 */
export function arquivosVersionados(raiz, filtro) {
  let saida;
  try {
    saida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: raiz,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (erro) {
    falharFechado(`não foi possível listar os arquivos com git (${erro.message})`);
  }
  const caminhos = saida
    .split('\0')
    .filter((c) => c && (EXTENSOES.test(c) || NOMES.test(c.replaceAll('\\', '/'))) && filtro(c.replaceAll('\\', '/')));
  if (caminhos.length === 0) falharFechado('nenhum arquivo para checar (lista vazia)');
  return caminhos.map((caminho) => {
    try {
      return { caminho, texto: readFileSync(join(raiz, caminho), 'utf8') };
    } catch (erro) {
      return falharFechado(`não foi possível ler ${caminho} (${erro.message})`);
    }
  });
}

/** Procura `regex` linha a linha e devolve `arquivo:linha: trecho`. */
export function procurar(arquivos, regex, excecoes = []) {
  const achados = [];
  for (const { caminho, texto } of arquivos) {
    texto.split(/\r?\n/).forEach((linha, i) => {
      if (regex.test(linha) && !excecoes.some((excecao) => linha.includes(excecao)))
        achados.push(`${caminho}:${i + 1}: ${linha.trim().slice(0, 120)}`);
    });
  }
  return achados;
}

/** Imprime os achados e encerra com 1 se houver algum. */
export function encerrar(achados, titulo) {
  if (achados.length === 0) process.exit(0);
  console.error(`${titulo}:`);
  for (const achado of achados) console.error(`  ${achado}`);
  process.exit(1);
}
