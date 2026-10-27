// Regras de ESLint próprias do projeto, escritas sobre a árvore sintática (não sobre o texto do código).

const NOME_DONO = /^e_?dono$/i;
// Nome do papel de dono dentro de um texto (SQL, nome de coluna): `e_dono` ou `eDono` como palavra inteira.
const CITA_DONO = /\be_?dono\b/i;
const MENSAGEM_DONO = 'Leitura ou escrita do papel de dono fora de backend/scripts e das migrações (G-11, ACE-63).';

/** Texto de uma expressão feita só de literais de texto (`'e_' + 'dono'`), ou `undefined`. */
function textoFixo(no) {
  if (!no) return undefined;
  if (no.type === 'Literal' && typeof no.value === 'string') return no.value;
  if (no.type === 'TemplateLiteral' && no.expressions.length === 0) return no.quasis[0].value.cooked ?? undefined;
  if (no.type === 'BinaryExpression' && no.operator === '+') {
    const esquerda = textoFixo(no.left);
    const direita = textoFixo(no.right);
    return esquerda !== undefined && direita !== undefined ? esquerda + direita : undefined;
  }
  return undefined;
}

function nomeDaChave(chave, computada) {
  if (!computada && chave.type === 'Identifier') return chave.name;
  return textoFixo(chave);
}

const semEscritaDono = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { funcoesPermitidas: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const permitidas = new Set(context.options[0]?.funcoesPermitidas ?? []);
    const dentroDePermitida = (no) => {
      for (let pai = no.parent; pai; pai = pai.parent) {
        if (pai.type === 'FunctionDeclaration' && pai.id && permitidas.has(pai.id.name)) return true;
        const funcaoAnonima = pai.type === 'ArrowFunctionExpression' || pai.type === 'FunctionExpression';
        if (funcaoAnonima && pai.parent?.type === 'VariableDeclarator' && permitidas.has(pai.parent.id.name)) {
          return true;
        }
      }
      return false;
    };
    const relatar = (no) => {
      if (!dentroDePermitida(no)) context.report({ node: no, message: MENSAGEM_DONO });
    };
    const textoSql = (no, texto) => {
      if (CITA_DONO.test(texto)) relatar(no);
    };

    return {
      // `c.eDono`, `{ eDono: x }`, `const { e_dono } = c`, `o.e_dono = v`: qualquer uso do nome, lendo ou escrevendo.
      // Só a declaração de tipo (`interface T { e_dono: boolean }`) é permitida: ela não lê nem escreve nada.
      Identifier(no) {
        if (!NOME_DONO.test(no.name)) return;
        if (no.parent.type === 'TSPropertySignature' && no.parent.key === no) return;
        relatar(no);
      },
      // SQL escrito à mão que cita o papel, seja SELECT, seja escrita.
      TemplateLiteral(no) {
        textoSql(no, no.quasis.map((q) => q.value.cooked ?? '').join(' '));
      },
      // `.select('e_dono')`, `c['eDono']`, `{ 'e_dono': x }`, `'SELECT e_dono FROM contas'`.
      Literal(no) {
        if (typeof no.value === 'string') textoSql(no, no.value);
      },
      // Nome do papel montado em tempo de execução: `'e_' + 'dono'`, `'e_' + x`.
      BinaryExpression(no) {
        if (no.operator !== '+') return;
        const inteiro = textoFixo(no);
        const cabeca = textoFixo(no.left);
        if ((inteiro !== undefined && NOME_DONO.test(inteiro)) || cabeca?.toLowerCase() === 'e_') relatar(no);
      },
    };
  },
};

// G-26: `periodos_ativos` só é escrita nos repositórios do período (a config exclui os dois arquivos).
const TABELA_PERIODO = /^periodos_ativos$/i;
const ESCRITA_NA_TABELA = /\b(?:insert\s+into|update|merge\s+into)\s+(?:only\s+)?(?:"?\w+"?\.)?"?periodos_ativos\b/i;
const METODOS_DE_TABELA = new Set(['insertInto', 'updateTable', 'mergeInto']);
const MENSAGEM_PERIODO = 'Escrita em periodos_ativos fora dos repositórios do período (G-26).';

const semEscritaPeriodo = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const relatar = (no) => context.report({ node: no, message: MENSAGEM_PERIODO });
    return {
      // SQL escrito à mão: `UPDATE periodos_ativos …`, `INSERT INTO public."periodos_ativos" …`.
      TemplateLiteral(no) {
        if (ESCRITA_NA_TABELA.test(no.quasis.map((q) => q.value.cooked ?? '').join(' '))) relatar(no);
        // Nome montado em tempo de execução: `periodos_${x}`.
        if (no.expressions.length > 0 && /^periodos_?$/i.test(no.quasis[0].value.cooked ?? '')) relatar(no);
      },
      Literal(no) {
        if (typeof no.value !== 'string') return;
        if (ESCRITA_NA_TABELA.test(no.value)) relatar(no);
        if (!TABELA_PERIODO.test(no.value)) return;
        // `insertInto('periodos_ativos')`, `updateTable('periodos_ativos')`.
        const pai = no.parent;
        const metodo = pai.type === 'CallExpression' ? pai.callee : undefined;
        if (
          metodo?.type === 'MemberExpression' &&
          METODOS_DE_TABELA.has(nomeDaChave(metodo.property, metodo.computed))
        ) {
          relatar(no);
        }
        // O nome da tabela guardado numa variável escapa da checagem do uso.
        if (pai.type === 'VariableDeclarator' && pai.init === no) relatar(no);
      },
      // `'periodos' + '_ativos'`, `'periodos' + x`.
      BinaryExpression(no) {
        if (no.operator !== '+') return;
        const inteiro = textoFixo(no);
        const cabeca = textoFixo(no.left);
        if ((inteiro !== undefined && TABELA_PERIODO.test(inteiro)) || cabeca?.toLowerCase() === 'periodos')
          relatar(no);
      },
    };
  },
};

export default { rules: { 'sem-escrita-dono': semEscritaDono, 'sem-escrita-periodo': semEscritaPeriodo } };
