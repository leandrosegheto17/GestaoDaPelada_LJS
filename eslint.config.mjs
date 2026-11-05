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

// GEL-70 (AD-028): o domínio não lê o relógio; "hoje" chega como parâmetro.
const SEM_RELOGIO = [
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
];

// PAR-61 (partidas-e-ranking T51; BD:306-308): fora de `backend/dominio/src/pontuacao/` ninguém soma pontos nem chama
// as somas internas; o acumulado sai só pela função única do módulo.
const MSG_ACUMULADO =
  'PAR-61: acumuladoAte, acumuladoComInicial e pontosDaPresenca são internas de backend/dominio/src/pontuacao/; use a função única do acumulado.';
const somasInternas = (nomes) =>
  nomes.flatMap((nome) => [
    { selector: `ImportSpecifier[imported.name='${nome}']`, message: MSG_ACUMULADO },
    { selector: `CallExpression[callee.name='${nome}']`, message: MSG_ACUMULADO },
    { selector: `MemberExpression[property.name='${nome}']`, message: MSG_ACUMULADO },
  ]);
const ACUMULADO_SO_NA_PONTUACAO = somasInternas(['acumuladoAte', 'acumuladoComInicial', 'pontosDaPresenca']);
/** As rodadas do ranking mostram o ponto de cada presença, mas não somam por conta própria. */
const SOMA_SO_NA_PONTUACAO = somasInternas(['acumuladoAte', 'acumuladoComInicial']);

// O `no-restricted-syntax` de um bloco substitui o dos anteriores (não soma): cada bloco repete as listas que valem nele.
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
    // PAR-61: vale em todo o backend e o front; o domínio repete a lista no bloco dele, abaixo.
    files: ['backend/**/*.{ts,tsx,mjs,js}', 'frontend/**/*.{ts,tsx,mjs,js}'],
    rules: { 'no-restricted-syntax': ['error', ...ACUMULADO_SO_NA_PONTUACAO] },
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
      // GEL-70 (AD-028) e PAR-61.
      'no-restricted-syntax': ['error', ...SEM_RELOGIO, ...ACUMULADO_SO_NA_PONTUACAO],
    },
  },
  {
    // PAR-61: único lugar que chama as somas internas e o ponto da presença (o relógio segue barrado).
    files: ['backend/dominio/src/pontuacao/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...SEM_RELOGIO] },
  },
  {
    // Os testes do módulo de pontuação exercitam as funções internas dele.
    files: ['backend/dominio/test/pontuacao/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // SPEC_DEVIATION: o desenho (BD:306-308) proíbe pontosDaPresenca fora da pontuação, mas as rodadas do ranking (T10,
    // PAR-71) mostram o ponto de cada presença com ela; só este arquivo a chama, e as somas internas seguem barradas.
    // Mesma exceção do LJS (`eslint.config.mjs` @ c6dc82c, `somaSoNaPontuacao`).
    files: ['backend/dominio/src/ranking/rodadas.ts'],
    rules: { 'no-restricted-syntax': ['error', ...SEM_RELOGIO, ...SOMA_SO_NA_PONTUACAO] },
  },
  prettier,
);
