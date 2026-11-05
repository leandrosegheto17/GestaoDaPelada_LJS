import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MODULOS_IO = [
  'pg',
  'kysely',
  'node-pg-migrate',
  'hono',
  'fs',
  'node:fs',
  'net',
  'node:net',
  'http',
  'node:http',
  'https',
  'node:https',
  'child_process',
  'node:child_process',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '.specs/**',
      '.claude/**',
      '.rascunho/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-var': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['frontend/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // FUN-06: o domínio é puro, sem rede, banco nem sistema de arquivos.
    files: ['backend/dominio/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...MODULOS_IO.map((name) => ({ name, message: 'FUN-06: o domínio não faz I/O.' })),
          ],
          patterns: [
            { group: ['node:fs/*', 'fs/*', 'pg/*', 'hono/*'], message: 'FUN-06: o domínio não faz I/O.' },
            // GEL-104 (AD-028): validação de entrada é do contrato; o domínio recebe dados já validados.
            { group: ['zod', 'zod/*'], message: 'GEL-104: o domínio não usa zod; a validação é do contrato.' },
          ],
        },
      ],
      // GEL-70 (AD-028): o domínio não lê o relógio; "hoje" chega como parâmetro.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'GEL-70: o domínio não lê o relógio; receba "hoje" como parâmetro.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'GEL-70: o domínio não lê o relógio; receba "hoje" como parâmetro.',
        },
        {
          selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          message: 'GEL-70: o domínio não lê o relógio; receba "hoje" como parâmetro.',
        },
      ],
    },
  },
  prettier,
);
