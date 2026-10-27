import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { encerrar, falharFechado } from './arquivos.mjs';

// G-03: toda função exportada pelos repositórios recebe `grupoId` como primeiro parâmetro de dado (o `db: Db`, se
// vier, fica antes). O que não é dado de grupo (conta, sessão, link, convite lido pelo token, seed) vai para
// `grupo-id-excecoes.json`, cada exceção com motivo: o arquivo inteiro, ou só uma função (`funcao`). Análise só de
// sintaxe (TypeScript), e fechada: export que não é função declarada nem arrow/function expression falha.
const RAIZ = process.argv[2] ?? process.cwd();
const PASTA = join(RAIZ, 'backend/api/src/infraestrutura/db/repositorios');
const EXCECOES = join(RAIZ, 'backend/scripts/checagens/grupo-id-excecoes.json');
const NAO_ANALISAVEL = 'forma de export não analisável; use função declarada ou exceção com motivo';

if (!existsSync(PASTA) || !statSync(PASTA).isDirectory()) falharFechado(`pasta de repositórios ausente: ${PASTA}`);

function listar(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) return listar(caminho);
    return /\.(ts|mts|cts)$/.test(e.name) && !/\.test\.[a-z]+$/.test(e.name) ? [caminho] : [];
  });
}

let excecoes = [];
try {
  if (existsSync(EXCECOES)) excecoes = JSON.parse(readFileSync(EXCECOES, 'utf8'));
} catch (erro) {
  falharFechado(`exceções ilegíveis (${erro.message})`);
}
if (!Array.isArray(excecoes)) falharFechado('exceções: o arquivo precisa ser uma lista');
const usadas = new Set();
function excecao(arquivo, funcao) {
  const i = excecoes.findIndex((e) => e.arquivo === arquivo && (e.funcao === undefined || e.funcao === funcao));
  if (i >= 0) usadas.add(i);
  return i >= 0;
}

const exportado = (no) => ts.getModifiers(no)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
const ehPadrao = (no) => ts.getModifiers(no)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;

function semAsserts(e) {
  let atual = e;
  while (ts.isParenthesizedExpression(atual) || ts.isAsExpression(atual) || ts.isSatisfiesExpression(atual)) {
    atual = atual.expression;
  }
  return atual;
}

function problemaDosParametros(funcao) {
  const parametros = [...funcao.parameters];
  if (parametros[0]?.type?.getText() === 'Db') parametros.shift();
  const alvo = parametros[0];
  if (!alvo) return 'sem parâmetro grupoId';
  if (alvo.dotDotDotToken) return 'parâmetro rest no lugar de grupoId';
  if (!ts.isIdentifier(alvo.name)) return 'grupoId desestruturado';
  if (alvo.name.text !== 'grupoId') return `1º parâmetro de dado é "${alvo.name.text}", não grupoId`;
  return null;
}

/** Exportações de valor de um comando: [nome, função ou null (não analisável)]. Tipos ficam de fora. */
function exportacoes(comando) {
  if (ts.isFunctionDeclaration(comando) && exportado(comando)) {
    return [[ehPadrao(comando) ? 'default' : (comando.name?.text ?? 'default'), comando]];
  }
  if (ts.isVariableStatement(comando) && exportado(comando)) {
    return comando.declarationList.declarations.map((d) => {
      const inicial = d.initializer && semAsserts(d.initializer);
      const funcao = inicial && (ts.isArrowFunction(inicial) || ts.isFunctionExpression(inicial)) ? inicial : null;
      return [ts.isIdentifier(d.name) ? d.name.text : '?', funcao];
    });
  }
  if (ts.isExportAssignment(comando)) {
    const e = semAsserts(comando.expression);
    return [['default', ts.isArrowFunction(e) || ts.isFunctionExpression(e) ? e : null]];
  }
  if (ts.isExportDeclaration(comando) && !comando.isTypeOnly) return [['*', null]];
  if ((ts.isClassDeclaration(comando) || ts.isEnumDeclaration(comando)) && exportado(comando)) {
    return [[comando.name?.text ?? 'default', null]];
  }
  if (ts.isModuleDeclaration(comando) && exportado(comando)) return [[comando.name.getText(), null]];
  return [];
}

const achados = [];
const arquivos = listar(PASTA);
for (const caminho of arquivos) {
  const rel = relative(PASTA, caminho).replaceAll('\\', '/');
  const fonte = ts.createSourceFile(caminho, readFileSync(caminho, 'utf8'), ts.ScriptTarget.Latest, true);
  if (fonte.parseDiagnostics?.length) falharFechado(`erro de sintaxe em ${rel}`);
  for (const comando of fonte.statements) {
    for (const [nome, funcao] of exportacoes(comando)) {
      const problema = funcao ? problemaDosParametros(funcao) : NAO_ANALISAVEL;
      if (problema && !excecao(rel, nome)) {
        const { line } = fonte.getLineAndCharacterOfPosition(comando.getStart());
        achados.push(`${rel}:${line + 1}: ${nome}: ${problema}`);
      }
    }
  }
}

excecoes.forEach((e, i) => {
  if (!usadas.has(i)) achados.push(`exceção sem correspondência (${e.arquivo})`);
  if (!e.motivo) achados.push(`exceção sem motivo (${e.arquivo})`);
});

encerrar(achados, 'Função de repositório sem grupoId como 1º parâmetro de dado (G-03)');
