import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-var': 'error', 'prefer-const': 'error' } },
  {
    files: ['backend/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['pg', 'hono'].map((name) => ({ name, message: 'O domínio não faz I/O.' })),
          patterns: [
            {
              group: [
                'node:fs',
                'node:fs/*',
                'node:net',
                'node:http',
                'node:child_process',
                'hono/*',
              ],
              message: 'O domínio não faz I/O.',
            },
          ],
        },
      ],
    },
  },
);
