import js from '@eslint/js';
import tseslint from 'typescript-eslint';

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
      '**/fixtures-lint/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-var': 'error', 'prefer-const': 'error' } },
  {
    // Scripts .mjs (e2e e raiz): rodam no Node e usam `document` só dentro de page.evaluate.
    files: ['frontend/web/e2e/**/*.mjs', 'scripts/**/*.mjs', 'backend/scripts/ops/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['backend/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['pg', 'node:fs', 'node:net', 'node:http', 'node:child_process', 'hono'].map(
            (name) => ({
              name,
              message: 'O domínio não faz I/O (FUN-06).',
            }),
          ),
        },
      ],
    },
  },
);
