import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Migração aditiva (FUN-56): migração nova não pode apagar nem mudar o que a produção já tem.
 * As migrações herdadas ficam numa lista fechada por hash (migracoes.sha256) e não são reanalisadas.
 * Exceção por arquivo: a linha `-- excecao-aditiva: AD-NNN`, com a AD registrada em STATE.md.
 */
export interface Violacao {
  arquivo: string;
  motivo: string;
}

export interface OpcoesVerificacao {
  dir: string;
  /** Caminho do STATE.md onde as ADs de exceção precisam existir. */
  estado: string;
  /** nome do arquivo -> sha256 das migrações herdadas. */
  hashesHerdados: Record<string, string>;
}

const PROIBIDOS: [RegExp, string][] = [
  [/\bdrop\s+table\b/i, 'DROP TABLE'],
  [/\bdrop\s+column\b/i, 'DROP COLUMN'],
  [/\balter\s+column\s+"?\w+"?\s+(?:set\s+data\s+)?type\b/i, 'ALTER ... TYPE'],
  [/\brename\b/i, 'RENAME'],
];

/** Só a seção Up, sem comentários nem literais de texto. */
function sqlDaSecaoUp(sql: string): string {
  const [up = ''] = sql.split(/^--\s*Down Migration\s*$/im);
  return up
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function verificarMigracoes(opcoes: OpcoesVerificacao): Violacao[] {
  const estado = existsSync(opcoes.estado) ? readFileSync(opcoes.estado, 'utf8') : '';
  const violacoes: Violacao[] = [];
  const arquivos = readdirSync(opcoes.dir)
    .filter((n) => n.endsWith('.sql'))
    .sort();

  for (const arquivo of arquivos) {
    const bruto = readFileSync(resolve(opcoes.dir, arquivo));
    const herdado = opcoes.hashesHerdados[arquivo];
    if (herdado !== undefined) {
      const hash = createHash('sha256').update(bruto).digest('hex');
      if (hash !== herdado) {
        violacoes.push({
          arquivo,
          motivo: 'migração herdada alterada: o hash difere da lista fechada',
        });
      }
      continue;
    }

    const texto = bruto.toString('utf8');
    const proibidos = PROIBIDOS.filter(([re]) => re.test(sqlDaSecaoUp(texto))).map(([, n]) => n);
    if (proibidos.length === 0) continue;

    const excecao = /^--\s*excecao-aditiva:\s*(AD-\d+)\s*$/im.exec(texto);
    if (!excecao) {
      violacoes.push({
        arquivo,
        motivo: `comando destrutivo em migração nova (${proibidos.join(', ')}); só com a linha "-- excecao-aditiva: AD-NNN"`,
      });
    } else if (!estado.includes(`**${excecao[1]}**`)) {
      violacoes.push({
        arquivo,
        motivo: `a exceção cita ${excecao[1]}, que não existe em STATE.md (${proibidos.join(', ')})`,
      });
    }
  }
  return violacoes;
}

export function lerHashesHerdados(dir: string): Record<string, string> {
  const arquivo = resolve(dir, 'migracoes.sha256');
  if (!existsSync(arquivo)) return {};
  const hashes: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, 'utf8').split('\n').filter(Boolean)) {
    const [hash, nome] = linha.split(/\s+/);
    if (hash && nome) hashes[nome] = hash;
  }
  return hashes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(import.meta.dirname, '../../..');
  const dir = resolve(raiz, 'backend/api/src/infraestrutura/db/migracoes');
  const violacoes = verificarMigracoes({
    dir,
    estado: resolve(raiz, '.specs/STATE.md'),
    hashesHerdados: lerHashesHerdados(dir),
  });
  for (const v of violacoes) console.error(`${v.arquivo}: ${v.motivo}`);
  process.exitCode = violacoes.length > 0 ? 1 : 0;
  if (violacoes.length === 0) console.log('Migrações aditivas: ok.');
}
