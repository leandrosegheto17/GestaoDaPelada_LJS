import stylelint from 'stylelint';

/**
 * Regra `pelada/so-tokens` (FUN-32): fonte e sombra só por `var(--…)` dos tokens. Cobre
 * `font`, `font-family`, `box-shadow` e `text-shadow`. A cor literal é recusada pelas regras
 * nativas (`color-no-hex`, `color-named`, `function-disallowed-list`) no `.stylelintrc.json`.
 *
 * Exceção única: o descritor `font-family` dentro de `@font-face`, que é o nome da fonte que
 * está sendo declarada (não aceita `var()`).
 */

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const ruleName = 'pelada/so-tokens';

export const messages = ruleMessages(ruleName, {
  rejected: (prop, valor) =>
    `"${prop}: ${valor}" é literal; use um token de tokens.css (var(--…)).`,
});

const PROPRIEDADES = new Set(['font', 'font-family', 'box-shadow', 'text-shadow']);
const PALAVRAS_LIVRES = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'none']);

function dentroDeFontFace(decl) {
  const pai = decl.parent;
  return pai?.type === 'atrule' && pai.name.toLowerCase() === 'font-face';
}

const regra = (primaria) => (raiz, resultado) => {
  if (!validateOptions(resultado, ruleName, { actual: primaria, possible: [true] })) return;
  raiz.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!PROPRIEDADES.has(prop)) return;
    if (dentroDeFontFace(decl)) return;
    const valor = decl.value.trim();
    if (PALAVRAS_LIVRES.has(valor.toLowerCase())) return;
    if (/var\(\s*--/.test(valor)) return;
    report({
      ruleName,
      result: resultado,
      node: decl,
      message: messages.rejected(decl.prop, valor),
      word: valor,
    });
  });
};

regra.ruleName = ruleName;
regra.messages = messages;
regra.meta = { url: 'https://github.com/' };

export default createPlugin(ruleName, regra);
