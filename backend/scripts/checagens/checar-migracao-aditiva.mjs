import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encerrar, falharFechado } from './arquivos.mjs';
import { normalizarSql } from './sql-normalizado.mjs';

const PASTA = process.argv[2] ?? join(import.meta.dirname, '../../api/src/infraestrutura/db/migracoes');

const ISENCAO = /^[ \t]*--[ \t]*contrair:[ \t]*(\S.*)$/m;

const REGRAS = [
  [/\bdrop\b/, 'DROP só com a linha "-- contrair: <motivo>"'],
  [/\brename\b/, 'RENAME só com a linha "-- contrair: <motivo>"'],
  [/\balter\s+(?:column\s+)?\S+\s+(?:set\s+data\s+)?type\b/, 'ALTER … TYPE só com a linha "-- contrair: <motivo>"'],
  [/\b(money|real|double\s+precision|float\d*)\b/, 'tipo de ponto flutuante ou money (G-07)'],
  [/\b(numeric|decimal)\b/, 'numeric/decimal: valor em centavos inteiros (G-07)'],
];

function analisar(texto) {
  if (ISENCAO.test(texto)) return [];
  const { texto: sql, linhas } = normalizarSql(texto);
  if (sql === '') return [{ linha: 1, motivo: 'migração vazia' }];
  const achados = [];
  const linhaDe = (indice) => linhas[indice] ?? 1;

  for (const [regra, motivo] of REGRAS) {
    const regex = new RegExp(regra.source, 'g');
    for (const m of sql.matchAll(regex)) achados.push({ linha: linhaDe(m.index), motivo });
  }

  for (const m of sql.matchAll(/\balter\s+(?:column\s+)?(\S+)\s+set\s+not\s+null\b/g)) {
    const coluna = m[1];
    const comPadrao = new RegExp(
      `\\balter\\s+(?:column\\s+)?${escapar(coluna)}\\s+set\\s+default\\b|\\badd\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${escapar(coluna)}\\b[^;]*\\bdefault\\b`,
    );
    if (!comPadrao.test(sql)) {
      achados.push({ linha: linhaDe(m.index), motivo: 'SET NOT NULL sem DEFAULT para a coluna' });
    }
  }

  let deslocamento = 0;
  for (const comando of sql.split(';')) {
    if (/\badd\s+column\b/.test(comando) && /\bnot\s+null\b/.test(comando) && !/\bdefault\b/.test(comando)) {
      achados.push({
        linha: linhaDe(deslocamento + (comando.startsWith(' ') ? 1 : 0)),
        motivo: 'ADD COLUMN NOT NULL sem DEFAULT',
      });
    }
    deslocamento += comando.length + 1;
  }
  return achados;
}

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let nomes;
try {
  nomes = readdirSync(PASTA).filter((nome) => nome.endsWith('.sql'));
} catch (erro) {
  falharFechado(`não foi possível ler a pasta de migrações (${erro.message})`);
}

const achados = [];
for (const nome of nomes.sort()) {
  let texto;
  try {
    texto = readFileSync(join(PASTA, nome), 'utf8');
  } catch (erro) {
    falharFechado(`não foi possível ler ${nome} (${erro.message})`);
  }
  try {
    for (const a of analisar(texto)) achados.push(`${nome}:${a.linha}: ${a.motivo}`);
  } catch (erro) {
    achados.push(`${nome}:1: SQL ilegível para a checagem (${erro.message})`);
  }
}
console.log(`${nomes.length} migração(ões) conferida(s).`);
encerrar(achados, 'Migração não aditiva ou com tipo proibido (G-14, G-07)');
