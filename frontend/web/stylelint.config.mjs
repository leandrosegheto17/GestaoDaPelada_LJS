/** Aparência = mockup: só variáveis de tokens.css. Cor, fonte e sombra literais são proibidas. */
export default {
  ignoreFiles: ['src/estilos/tokens.css', 'dist/**', 'public/**'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
      'color-mix',
    ],
    'property-disallowed-list': ['font'],
    'declaration-property-value-allowed-list': {
      'font-family': [String.raw`/^var\(--[a-z0-9-]+\)$/`, 'inherit'],
      '/shadow$/': [String.raw`/^var\(--[a-z0-9-]+\)$/`, 'inherit', 'none'],
    },
  },
};
