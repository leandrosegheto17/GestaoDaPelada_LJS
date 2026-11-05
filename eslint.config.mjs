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
          ],
        },
      ],
    },
  },
  prettier,
);
