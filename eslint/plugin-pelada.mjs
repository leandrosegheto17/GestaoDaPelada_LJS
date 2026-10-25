// Regras de ESLint próprias do projeto, escritas sobre a árvore sintática (não sobre o texto do código).

const NOME_DONO = /^e_?dono$/i;
const ESCRITA_SQL = /\b(?:insert|update|upsert|set|values)\b|\bon\s+conflict\b/i;
// Métodos do Kysely cujos argumentos descrevem uma escrita.
const METODOS_DE_ESCRITA = new Set([
  'set',
  'values',
  'columns',
  'onConflict',
  'doUpdateSet',
  'insertInto',
  'updateTable',
]);
const COMPARACOES = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=', 'in', 'instanceof']);
const MENSAGEM_DONO = 'Escrita do papel de dono fora de backend/scripts e das migrações (G-11).';

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

function raizDoEncadeamento(no) {
  let atual = no;
  while (atual) {
    if (atual.type === 'Identifier') return atual.name;
    if (atual.type === 'MemberExpression') atual = atual.object;
    else if (atual.type === 'CallExpression') atual = atual.callee;
    else return undefined;
  }
  return undefined;
}

/** Valor que só lê (projeção de resposta, comparação, schema zod): não escreve o papel. */
function ehLeitura(valor) {
  switch (valor.type) {
    case 'MemberExpression':
    case 'ChainExpression':
      return true;
    case 'BinaryExpression':
      return COMPARACOES.has(valor.operator);
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression':
      return ehLeitura(valor.expression);
    case 'CallExpression':
      return raizDoEncadeamento(valor.callee) === 'z';
    default:
      return false;
  }
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
    const alvoDeEscrita = (alvo) => {
      if (alvo.type !== 'MemberExpression') return;
      const nome = nomeDaChave(alvo.property, alvo.computed);
      if (nome && NOME_DONO.test(nome)) relatar(alvo);
    };
    const textoSql = (no, texto) => {
      if (/e_?dono/i.test(texto) && ESCRITA_SQL.test(texto)) relatar(no);
    };

    return {
      // `{ e_dono: true }`, `{ 'eDono': !!x }`, `{ [chave]: v }` com chave fixa; projeção (`eDono: c.eDono`) não conta.
      Property(no) {
        if (no.parent.type !== 'ObjectExpression') return;
        const nome = nomeDaChave(no.key, no.computed);
        if (nome && NOME_DONO.test(nome) && !ehLeitura(no.value)) relatar(no);
      },
      // `o.e_dono = v`, `o['eDono'] ||= v`, `o.eDono++`.
      AssignmentExpression(no) {
        alvoDeEscrita(no.left);
      },
      UpdateExpression(no) {
        alvoDeEscrita(no.argument);
      },
      // SQL escrito à mão: o texto cita o papel e tem verbo de escrita.
      TemplateLiteral(no) {
        textoSql(no, no.quasis.map((q) => q.value.cooked ?? '').join(' '));
      },
      Literal(no) {
        if (typeof no.value === 'string') {
          textoSql(no, no.value);
          // `.set('e_dono', v)`, `.columns(['e_dono'])`: nome de coluna como argumento de um método de escrita.
          if (NOME_DONO.test(no.value)) {
            const chamada = no.parent.type === 'ArrayExpression' ? no.parent.parent : no.parent;
            const metodo = chamada.type === 'CallExpression' ? chamada.callee : undefined;
            if (
              metodo?.type === 'MemberExpression' &&
              METODOS_DE_ESCRITA.has(nomeDaChave(metodo.property, metodo.computed))
            ) {
              relatar(no);
            }
          }
        }
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
