// Regras de ESLint próprias do projeto, sobre a árvore sintática (não sobre o texto do arquivo).
//
// `sem-escrita-periodo` (partidas-e-ranking T52; PAR-140; BD:309-314; AD-039): só o repositório de jogadores e as
// migrações escrevem em `periodos_ativos` (a config exclui os dois). Reprova:
// - Kysely `insertInto`, `updateTable` ou `mergeInto` com o nome da tabela;
// - SQL à mão `INSERT INTO`, `UPDATE` ou `MERGE INTO periodos_ativos`, em texto ou template;
// - o nome da tabela guardado numa variável ou montado por partes (`'periodos' + x`, `periodos_${x}`), que escaparia
//   das duas formas acima.
// Ler a tabela (`selectFrom('periodos_ativos')`, `SELECT … FROM periodos_ativos`) passa. `deleteFrom` e
// `inicio_pontuacao` seguem com a checagem `backend/scripts/checagens/escritores-periodo.ts` (GEL-83, GEL-111).

const TABELA = /^periodos_ativos$/i;
const ESCRITA_SQL = /\b(?:insert\s+into|update|merge\s+into)\s+(?:only\s+)?(?:"?\w+"?\.)?"?periodos_ativos\b/i;
const METODOS_DE_ESCRITA = new Set(['insertInto', 'updateTable', 'mergeInto']);
const MENSAGEM = 'PAR-140: escrita em periodos_ativos fora de repositorios/jogadores.ts e das migrações.';

/** Texto de uma expressão feita só de literais (`'periodos' + '_ativos'`), ou `undefined`. */
function textoFixo(no) {
  if (!no) return undefined;
  if (no.type === 'Literal' && typeof no.value === 'string') return no.value;
  if (no.type === 'TemplateLiteral' && no.expressions.length === 0) return no.quasis[0]?.value.cooked ?? undefined;
  if (no.type === 'BinaryExpression' && no.operator === '+') {
    const a = textoFixo(no.left);
    const b = textoFixo(no.right);
    return a !== undefined && b !== undefined ? a + b : undefined;
  }
  return undefined;
}

/** Nome do método chamado (`db.insertInto(...)` e `db['insertInto'](...)`), ou `undefined`. */
function metodoChamado(chamada) {
  if (chamada?.type !== 'CallExpression') return undefined;
  const callee = chamada.callee;
  if (callee.type !== 'MemberExpression') return undefined;
  if (!callee.computed && callee.property.type === 'Identifier') return callee.property.name;
  return textoFixo(callee.property);
}

const semEscritaPeriodo = {
  meta: {
    type: 'problem',
    docs: { description: 'Só o repositório de jogadores e as migrações escrevem em periodos_ativos (PAR-140).' },
    schema: [],
  },
  create(context) {
    const relatar = (node) => context.report({ node, message: MENSAGEM });
    /** O nome da tabela como argumento de escrita do Kysely, ou guardado numa variável. */
    const conferirNome = (no) => {
      const pai = no.parent;
      if (pai?.type === 'CallExpression' && pai.arguments[0] === no && METODOS_DE_ESCRITA.has(metodoChamado(pai) ?? '')) {
        relatar(no);
        return;
      }
      if (pai?.type === 'VariableDeclarator' && pai.init === no) relatar(no);
    };
    return {
      Literal(no) {
        if (typeof no.value !== 'string') return;
        if (ESCRITA_SQL.test(no.value)) relatar(no);
        else if (TABELA.test(no.value)) conferirNome(no);
      },
      TemplateLiteral(no) {
        const texto = no.quasis.map((q) => q.value.cooked ?? '').join(' ');
        if (ESCRITA_SQL.test(texto)) {
          relatar(no);
          return;
        }
        if (no.expressions.length === 0 && TABELA.test(texto)) {
          conferirNome(no);
          return;
        }
        // `periodos_${x}`: o nome montado em tempo de execução.
        if (no.expressions.length > 0 && /^periodos_?$/i.test(no.quasis[0]?.value.cooked ?? '')) relatar(no);
      },
      BinaryExpression(no) {
        if (no.operator !== '+') return;
        // Só a soma mais externa: `'periodos' + '_' + 'ativos'` gera um achado, não dois.
        if (no.parent?.type === 'BinaryExpression' && no.parent.operator === '+') return;
        const inteiro = textoFixo(no);
        if (inteiro !== undefined) {
          if (ESCRITA_SQL.test(inteiro) || TABELA.test(inteiro)) relatar(no);
          return;
        }
        // Cabeça fixa e resto variável: `'periodos' + x`, `'periodos_' + x`.
        let cabeca = no;
        while (cabeca.type === 'BinaryExpression' && cabeca.operator === '+') cabeca = cabeca.left;
        if (/^periodos_?$/i.test(textoFixo(cabeca) ?? '')) relatar(no);
      },
    };
  },
};

export default { meta: { name: 'pelada' }, rules: { 'sem-escrita-periodo': semEscritaPeriodo } };
