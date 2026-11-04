import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.specs/**',
      '.claude/**',
      '**/fixtures-lint/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-var': 'error', 'prefer-const': 'error' } },
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
