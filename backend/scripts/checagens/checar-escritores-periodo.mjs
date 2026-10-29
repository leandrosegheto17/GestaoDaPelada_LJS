import ts from 'typescript';
import { arquivosVersionados, encerrar } from './arquivos.mjs';

// G-26, GEL-83, GEL-111: só o repositório de jogadores escreve `periodos_ativos` (início e fim dos períodos) e
// `jogadores.inicio_pontuacao`; fora dele, só as migrations. Testes (fixtures gravadas pelo owner) e as próprias
// checagens ficam de fora. Procura, em todo código versionado:
// - Kysely: `insertInto`, `updateTable`, `deleteFrom`, `mergeInto`, `replaceInto` em `periodos_ativos`; chave
//   `inicio_pontuacao` num objeto literal (`.set({ … })`, `.values({ … })`) e `.set('inicio_pontuacao', …)`;
// - SQL escrito à mão (texto de qualquer string ou template): INSERT, UPDATE, DELETE, MERGE e TRUNCATE em
//   `periodos_ativos`; UPDATE de `jogadores` que atribui `inicio_pontuacao` e INSERT em `jogadores` que a lista.
const RAIZ = process.argv[2] ?? process.cwd();

const REPOSITORIO = 'backend/api/src/infraestrutura/db/repositorios/jogadores.ts';
const MIGRACOES = 'backend/api/src/infraestrutura/db/migracoes/';
/** Exceções com motivo: o arquivo inteiro. Nenhuma: o seed local grava períodos pelo repositório de jogadores (T52). */
const EXCECOES = [];

const CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sql)$/i;
const TESTE = /(^|\/)(test|tests|e2e|__tests__)\/|\.(test|spec)\.[a-z]+$/i;
const CHECAGENS = 'backend/scripts/checagens/';

const TABELA = /^(?:public\.)?"?periodos_ativos"?(?:\s+(?:as\s+)?\w+)?$/i;
const METODOS_DE_ESCRITA = new Set(['insertInto', 'updateTable', 'deleteFrom', 'mergeInto', 'replaceInto']);
const COLUNA_INICIO = 'inicio_pontuacao';

const TABELA_SQL = String.raw`(?:only\s+)?(?:"?public"?\.)?"?periodos_ativos"?\b`;
const SQL_PERIODO = new RegExp(
  String.raw`\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?)\s+${TABELA_SQL}`,
  'i',
);
const JOGADORES_SQL = String.raw`(?:only\s+)?(?:"?public"?\.)?"?jogadores"?`;
const SQL_INICIO = [
  new RegExp(String.raw`\bupdate\s+${JOGADORES_SQL}(?:\s+(?:as\s+)?\w+)?\s+set\b[^;]*?\binicio_pontuacao\b\s*=`, 'i'),
  new RegExp(String.raw`\binsert\s+into\s+${JOGADORES_SQL}\s*\([^)]*\binicio_pontuacao\b`, 'i'),
];

const permitido = (caminho) =>
  caminho === REPOSITORIO ||
  caminho.startsWith(MIGRACOES) ||
  caminho.startsWith(CHECAGENS) ||
  TESTE.test(caminho) ||
  EXCECOES.some((e) => e.arquivo === caminho);

function linhaDe(fonte, no) {
  return fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
}

function textoDe(no) {
  if (ts.isStringLiteralLike(no)) return no.text;
  if (ts.isTemplateExpression(no)) return [no.head.text, ...no.templateSpans.map((s) => s.literal.text)].join(' ');
  return undefined;
}

const nomeDaChave = (nome) =>
  ts.isIdentifier(nome) || ts.isStringLiteralLike(nome) || ts.isNumericLiteral(nome) ? nome.text : undefined;

/** Achados de um arquivo TypeScript ou JavaScript, pela árvore de sintaxe. */
function noCodigo(caminho, texto) {
  const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true);
  const achados = [];
  const achar = (no, motivo) => achados.push(`${caminho}:${linhaDe(fonte, no)}: ${motivo}`);
  const visitar = (no) => {
    const sql = textoDe(no);
    if (sql !== undefined) {
      if (SQL_PERIODO.test(sql)) achar(no, 'SQL que escreve periodos_ativos');
      if (SQL_INICIO.some((r) => r.test(sql))) achar(no, 'SQL que escreve jogadores.inicio_pontuacao');
    }
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression)) {
      const metodo = no.expression.name.text;
      const primeiro = no.arguments[0] && textoDe(no.arguments[0]);
      if (METODOS_DE_ESCRITA.has(metodo) && primeiro !== undefined && TABELA.test(primeiro.trim())) {
        achar(no, `${metodo} em periodos_ativos`);
      }
      if (metodo === 'set' && primeiro === COLUNA_INICIO) achar(no, 'set de inicio_pontuacao');
    }
    if (
      (ts.isPropertyAssignment(no) || ts.isShorthandPropertyAssignment(no)) &&
      ts.isObjectLiteralExpression(no.parent) &&
      nomeDaChave(no.name) === COLUNA_INICIO
    ) {
      achar(no, 'inicio_pontuacao num objeto de escrita');
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achados;
}

/** Achados de um arquivo SQL, comando a comando, na linha em que a escrita aparece. */
function noSql(caminho, texto) {
  const achados = [];
  let inicio = 0;
  for (const comando of texto.split(';')) {
    for (const [regex, motivo] of [
      [SQL_PERIODO, 'SQL que escreve periodos_ativos'],
      ...SQL_INICIO.map((r) => [r, 'SQL que escreve jogadores.inicio_pontuacao']),
    ]) {
      const m = regex.exec(comando);
      if (m) achados.push(`${caminho}:${texto.slice(0, inicio + m.index).split('\n').length}: ${motivo}`);
    }
    inicio += comando.length + 1;
  }
  return achados;
}

const arquivos = arquivosVersionados(RAIZ, (c) => CODIGO.test(c));
const achados = [];
for (const { caminho, texto } of arquivos) {
  const rel = caminho.replaceAll('\\', '/');
  if (permitido(rel)) continue;
  achados.push(...(rel.toLowerCase().endsWith('.sql') ? noSql(rel, texto) : noCodigo(rel, texto)));
}

encerrar(achados, 'Escrita de período ou de inicio_pontuacao fora do repositório de jogadores (G-26, GEL-111)');
