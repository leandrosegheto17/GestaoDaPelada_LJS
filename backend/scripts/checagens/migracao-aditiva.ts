import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const PASTA_REAL = join(RAIZ, 'backend', 'api', 'src', 'infraestrutura', 'db', 'migracoes');
const STATE_REAL = join(RAIZ, '.specs', 'STATE.md');

const DESTRUTIVOS: [string, RegExp][] = [
  ['DROP TABLE', /\bdrop\s+table\b/],
  ['DROP COLUMN', /\bdrop\s+column\b/],
  ['ALTER ... TYPE', /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/],
  ['RENAME', /\brename\b/],
];

const semComentarios = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

function listaFechada(pasta: string): Map<string, string> {
  const arquivo = join(pasta, 'migracoes.sha256');
  if (!existsSync(arquivo)) return new Map();
  return new Map(
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, nome] = l.trim().split(/\s+/) as [string, string];
        return [nome, hash] as const;
      }),
  );
}

/**
 * Reprova migração nova com DROP TABLE, DROP COLUMN, ALTER ... TYPE ou RENAME, salvo a linha
 * `-- excecao-aditiva: AD-NNN` com a AD registrada no STATE.md (FUN-56). Os arquivos da lista
 * fechada (as 23 copiadas, com hash) não são lidos; se o hash mudar, reprovam.
 */
export function checarMigracaoAditiva(op: { pasta: string; state: string }): Resultado {
  const fechados = listaFechada(op.pasta);
  const state = existsSync(op.state) ? readFileSync(op.state, 'utf8') : '';
  const violacoes: string[] = [];

  for (const nome of readdirSync(op.pasta)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const bytes = readFileSync(join(op.pasta, nome));
    const esperado = fechados.get(nome);
    if (esperado !== undefined) {
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== esperado) violacoes.push(`${nome}: arquivo da lista fechada foi alterado`);
      continue;
    }

    const sql = bytes.toString('utf8');
    const achados = DESTRUTIVOS.filter(([, re]) => re.test(semComentarios(sql).toLowerCase())).map(
      ([rotulo]) => rotulo,
    );
    if (achados.length === 0) continue;

    const excecao = /^\s*--\s*excecao-aditiva:\s*(AD-\d+)\s*$/m.exec(sql);
    if (!excecao) {
      violacoes.push(`${nome}: comando destrutivo (${achados.join(', ')}) sem exceção aditiva`);
    } else if (!state.includes(`**${excecao[1]}**`)) {
      violacoes.push(`${nome}: a exceção cita ${excecao[1]}, que não existe no STATE.md`);
    }
  }
  return { ok: violacoes.length === 0, violacoes };
}

export const checarPastaReal = () =>
  checarMigracaoAditiva({ pasta: PASTA_REAL, state: STATE_REAL });

if (import.meta.main) {
  const r = checarPastaReal();
  if (!r.ok) {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
  console.log('migração aditiva: ok');
}
