import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checagem `migracao-aditiva` (FUN-56, AD-003): migração nova não pode apagar tabela ou
 * coluna, mudar tipo nem renomear, salvo com `-- excecao-aditiva: AD-NNN` e a AD registrada
 * em `.specs/STATE.md`. As 23 herdadas ficam numa lista fechada por hash (`migracoes.sha256`).
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');
export const PASTA_MIGRACOES = join(RAIZ, 'backend', 'api', 'src', 'infraestrutura', 'db', 'migracoes');
export const ARQUIVO_STATE = join(RAIZ, '.specs', 'STATE.md');

const DESTRUTIVOS: Array<[string, RegExp]> = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP COLUMN', /\bDROP\s+COLUMN\b/i],
  ['ALTER ... TYPE', /\bALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|\w+)\s+(?:SET\s+DATA\s+)?TYPE\b/i],
  ['RENAME', /\bRENAME\b/i],
];

const EXCECAO = /^\s*--\s*excecao-aditiva:\s*(AD-\d{3,})\s*$/im;

export interface Entrada {
  /** Nome e conteúdo de cada `.sql`. */
  arquivos: Array<{ nome: string; conteudo: string }>;
  /** Lista fechada: nome → SHA-256 das herdadas. */
  herdadas: Map<string, string>;
  /** Texto do `.specs/STATE.md`. */
  state: string;
}

/** Tira comentários de linha e de bloco, para um DROP citado em comentário não contar. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function checarMigracoes(entrada: Entrada): string[] {
  const problemas: string[] = [];
  const presentes = new Set(entrada.arquivos.map((a) => a.nome));
  for (const nome of entrada.herdadas.keys()) {
    if (!presentes.has(nome)) problemas.push(`${nome}: migração herdada ausente`);
  }
  for (const { nome, conteudo } of entrada.arquivos) {
    const hashEsperado = entrada.herdadas.get(nome);
    if (hashEsperado !== undefined) {
      const hash = createHash('sha256').update(conteudo).digest('hex');
      if (hash !== hashEsperado) problemas.push(`${nome}: migração herdada alterada (hash diferente)`);
      continue;
    }
    const sql = semComentarios(conteudo);
    const achados = DESTRUTIVOS.filter(([, re]) => re.test(sql)).map(([n]) => n);
    if (achados.length === 0) continue;
    const excecao = EXCECAO.exec(conteudo)?.[1];
    if (!excecao) {
      problemas.push(`${nome}: não é aditiva (${achados.join(', ')}) e não declara excecao-aditiva`);
    } else if (!entrada.state.includes(`**${excecao}**`)) {
      problemas.push(`${nome}: excecao-aditiva cita ${excecao}, que não está em .specs/STATE.md`);
    }
  }
  return problemas;
}

export function lerHerdadas(pasta: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const l of readFileSync(join(pasta, 'migracoes.sha256'), 'utf8').split('\n')) {
    const [hash, nome] = l.trim().split(/\s+/);
    if (hash && nome) mapa.set(nome, hash);
  }
  return mapa;
}

export function entradaDoRepositorio(pasta = PASTA_MIGRACOES, state = ARQUIVO_STATE): Entrada {
  const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((nome) => ({ nome, conteudo: readFileSync(join(pasta, nome), 'utf8') }));
  return { arquivos, herdadas: lerHerdadas(pasta), state: readFileSync(state, 'utf8') };
}

if (import.meta.main) {
  const problemas = checarMigracoes(entradaDoRepositorio());
  for (const p of problemas) console.error(`migracao-aditiva: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
