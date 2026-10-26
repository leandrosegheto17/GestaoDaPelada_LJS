import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { importX } from 'eslint-plugin-import-x';
import { semAsUnknownAs, semDocumentCookie, semRelogio } from './eslint/regras-sintaxe.mjs';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

const PROIBIDAS_BASE = [
  'prisma',
  '@prisma/*',
  'drizzle-orm',
  'drizzle-orm/*',
  'express',
  '@neondatabase/serverless',
  'bcrypt',
  'bcryptjs',
  'argon2',
  '@node-rs/*',
  'moment',
  'axios',
  'tailwindcss',
];
const PROIBIDAS_GLOBAL = PROIBIDAS_BASE;
const BANCO = ['pg', 'pg/*', 'kysely', 'kysely/*'];
// Módulos de I/O (rede e arquivos) que o domínio não pode importar (FUN-06).
const IO = [
  'fs',
  'fs/*',
  'node:fs',
  'node:fs/*',
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
  'node:dns',
  'undici',
  'node-fetch',
  'ws',
];
const DOMINIO_PROIBIDAS = [
  'zod',
  'zod/*',
  'pg',
  'pg/*',
  'kysely',
  'kysely/*',
  'hono',
  'hono/*',
  '@pelada/contrato',
  '@pelada/contrato/*',
  ...IO,
];
const WEB_PROIBIDAS = ['@pelada/dominio', '@pelada/dominio/*', '@pelada/api', '@pelada/api/*'];

const restritos = (nomes) => ({
  patterns: [{ group: nomes, message: 'Importação proibida nesta pasta (fronteira de pacotes).' }],
});

const escapar = (nome) => nome.replace(/[.+?^${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
const casaLiteral = (nomes) => `^(${nomes.map(escapar).join('|')})$`;

const dinamicos = (nomes) => [
  {
    selector: "ImportExpression[source.type!='Literal']",
    message: 'import() com argumento não literal é proibido.',
  },
  {
    selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']",
    message: 'require() com argumento não literal é proibido.',
  },
  {
    selector: `ImportExpression[source.value=/${casaLiteral(nomes)}/]`,
    message: 'import() de pacote proibido nesta pasta.',
  },
  {
    selector: `CallExpression[callee.name='require'][arguments.0.value=/${casaLiteral(nomes)}/]`,
    message: 'require() de pacote proibido nesta pasta.',
  },
];

const SCRIPTS_PERMITIDOS = [
  'infraestrutura/db/repositorios',
  'infraestrutura/db/migracoes',
  'infraestrutura/seguranca',
  'aplicacao/acesso/senhas',
];
const MSG_ALIAS_API = 'Scripts só importam repositórios, migrações, seguranca e acesso/senhas de @pelada/api (G-01).';
const ALIAS_API_PROIBIDO = `^(?!@pelada\\/api\\/src\\/(${SCRIPTS_PERMITIDOS.map(escapar).join('|')})(\\/.*)?$)@pelada\\/api(\\/.*)?$`;

const sintaxe = (...grupos) => ['error', ...grupos.flat()];

const ZONAS = [
  {
    target: './frontend/web',
    from: ['./backend/dominio', './backend/api'],
    message: 'O web não importa domínio nem api (G-01).',
  },
  {
    target: './backend/dominio',
    from: ['./backend/contrato', './backend/api'],
    message: 'O domínio não importa contrato nem api (G-01).',
  },
  {
    target: './backend/scripts',
    from: './backend/api/src',
    except: [
      './infraestrutura/db/repositorios',
      './infraestrutura/db/migracoes',
      './infraestrutura/db/index.ts',
      './infraestrutura/seguranca',
      './aplicacao/acesso/senhas.ts',
    ],
    message: 'Scripts só importam repositórios, migrações, seguranca e acesso/senhas (G-01).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-visual/**',
      '.md/**',
      '.claude/**',
      '.specs/**',
      '.worktrees/**',
      'frontend/web/e2e/ferramentas/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['backend/**/*.{ts,tsx,mjs,js}', 'frontend/**/*.{ts,tsx,mjs,js}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      'no-restricted-imports': ['error', restritos([...PROIBIDAS_GLOBAL, ...BANCO])],
      'no-restricted-syntax': sintaxe(dinamicos([...PROIBIDAS_GLOBAL, ...BANCO]), semAsUnknownAs),
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: ZONAS }],
    },
  },
  {
    files: ['backend/api/**'],
    rules: {
      'no-restricted-syntax': sintaxe(dinamicos([...PROIBIDAS_GLOBAL, ...BANCO]), semRelogio, semAsUnknownAs),
    },
  },
  {
    // Apoio de teste da API conecta no Postgres de teste (nunca em produção).
    files: ['backend/api/test/**'],
    rules: {
      'no-restricted-imports': ['error', restritos(PROIBIDAS_BASE)],
      'no-restricted-syntax': sintaxe(dinamicos(PROIBIDAS_BASE), semRelogio, semAsUnknownAs),
    },
  },
  {
    files: ['backend/api/src/infraestrutura/db/**'],
    rules: {
      'no-restricted-imports': ['error', restritos(PROIBIDAS_GLOBAL)],
      'no-restricted-syntax': sintaxe(dinamicos(PROIBIDAS_GLOBAL), semRelogio, semAsUnknownAs),
    },
  },
  {
    // O alias não passa pela zona de caminhos relativos; barra-se aqui, liberando os mesmos caminhos.
    files: ['backend/scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restritos([...PROIBIDAS_BASE, ...BANCO]).patterns,
            { regex: ALIAS_API_PROIBIDO, message: MSG_ALIAS_API },
          ],
        },
      ],
      'no-restricted-syntax': sintaxe(dinamicos([...PROIBIDAS_BASE, ...BANCO]), semAsUnknownAs, [
        { selector: `ImportExpression[source.value=/${ALIAS_API_PROIBIDO}/]`, message: MSG_ALIAS_API },
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=/${ALIAS_API_PROIBIDO}/]`,
          message: MSG_ALIAS_API,
        },
      ]),
    },
  },
  {
    files: ['backend/dominio/**'],
    rules: {
      'no-restricted-imports': ['error', restritos([...PROIBIDAS_GLOBAL, ...DOMINIO_PROIBIDAS])],
      'no-restricted-syntax': sintaxe(
        dinamicos([...PROIBIDAS_GLOBAL, ...DOMINIO_PROIBIDAS]),
        semRelogio,
        semAsUnknownAs,
      ),
    },
  },
  {
    files: ['frontend/web/**'],
    rules: {
      'no-restricted-imports': ['error', restritos([...PROIBIDAS_GLOBAL, ...BANCO, ...WEB_PROIBIDAS])],
      'no-restricted-syntax': sintaxe(
        dinamicos([...PROIBIDAS_GLOBAL, ...BANCO, ...WEB_PROIBIDAS]),
        semDocumentCookie,
        semAsUnknownAs,
      ),
    },
  },
);
