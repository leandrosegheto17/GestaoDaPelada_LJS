const MSG_RELOGIO = 'Use o relógio de infraestrutura/relogio (G-06).';
export const semRelogio = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: MSG_RELOGIO,
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.value='now']",
    message: MSG_RELOGIO,
  },
  {
    selector:
      "CallExpression[callee.object.object.name='globalThis'][callee.object.property.name='Date'][callee.property.name='now']",
    message: MSG_RELOGIO,
  },
  {
    selector: "VariableDeclarator[init.name='Date']",
    message: MSG_RELOGIO,
  },
  {
    selector: "VariableDeclarator[init.object.name='globalThis'][init.property.name='Date']",
    message: MSG_RELOGIO,
  },
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: MSG_RELOGIO },
  {
    selector: "NewExpression[callee.object.name='globalThis'][callee.property.name='Date'][arguments.length=0]",
    message: MSG_RELOGIO,
  },
];

const MSG_UNKNOWN = 'Proibido converter via unknown: escreva um adaptador tipado.';
export const semAsUnknownAs = [
  {
    selector: "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
    message: MSG_UNKNOWN,
  },
  {
    selector: "TSTypeAssertion > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
    message: MSG_UNKNOWN,
  },
  { selector: "TSTypeAssertion[expression.type='TSAsExpression']", message: MSG_UNKNOWN },
  {
    selector: "TSTypeAssertion > TSTypeAssertion[typeAnnotation.type='TSUnknownKeyword']",
    message: MSG_UNKNOWN,
  },
  {
    selector: "TSAsExpression[expression.typeAnnotation.type='TSUnknownKeyword']",
    message: MSG_UNKNOWN,
  },
];

const MSG_COOKIE = 'document.cookie é proibido (G-09).';
export const semDocumentCookie = [
  {
    selector: "MemberExpression[object.name='document'][property.name='cookie']",
    message: MSG_COOKIE,
  },
  {
    selector: "MemberExpression[object.name='document'][property.value='cookie']",
    message: MSG_COOKIE,
  },
  {
    selector: "MemberExpression[object.property.name='document'][property.name='cookie']",
    message: MSG_COOKIE,
  },
  {
    selector: "MemberExpression[object.property.name='document'][property.value='cookie']",
    message: MSG_COOKIE,
  },
  {
    selector: "VariableDeclarator[init.name='document'] > ObjectPattern > Property[key.name='cookie']",
    message: MSG_COOKIE,
  },
  {
    selector: "VariableDeclarator[init.name='document'][id.type='Identifier']",
    message: MSG_COOKIE,
  },
  {
    selector: "VariableDeclarator[init.object.name='globalThis'][init.property.name='document']",
    message: MSG_COOKIE,
  },
];

const MSG_DONO = 'criarContaDono e apagarDadosDoSeed só podem ser usadas por backend/scripts.';
export const donoSoEmScripts = [
  { selector: "ImportSpecifier[imported.name='criarContaDono']", message: MSG_DONO },
  { selector: "MemberExpression[property.name='criarContaDono']", message: MSG_DONO },
  { selector: "ImportSpecifier[imported.name='apagarDadosDoSeed']", message: MSG_DONO },
  { selector: "MemberExpression[property.name='apagarDadosDoSeed']", message: MSG_DONO },
];

const MSG_ACUMULADO =
  'Acumulado só pela função acumuladoPorInicio (G-25); acumuladoAte e acumuladoComInicial são internas.';
export const acumuladoSoNaPontuacao = ['acumuladoAte', 'acumuladoComInicial'].flatMap((nome) => [
  { selector: `ImportSpecifier[imported.name='${nome}']`, message: MSG_ACUMULADO },
  { selector: `CallExpression[callee.name='${nome}']`, message: MSG_ACUMULADO },
  { selector: `MemberExpression[property.name='${nome}']`, message: MSG_ACUMULADO },
]);
