import { arquivosVersionados, encerrar, procurar } from './arquivos.mjs';

// G-02 (design conta-e-acesso, AD-008): o SQL de hash de senha (`crypt(`) mora só nas funções de conta das
// migrations; o código da aplicação chama essas funções e nunca monta o hash. Testes ficam de fora (conferem o hash
// gravado). A checagem e o próprio teste dela também.
const RAIZ = process.argv[2] ?? process.cwd();
const ESCOPO = /^(backend|frontend)\//;
const FORA =
  /\/node_modules\/|^backend\/api\/src\/infraestrutura\/db\/migracoes\/[^/]+\.sql$|(^|\/)(test|e2e)\/|\.test\.[a-z]+$|^backend\/scripts\/checagens\/checar-crypt\.mjs$/;
const CRYPT = /\bcrypt\s*\(/i;

const arquivos = arquivosVersionados(RAIZ, (c) => ESCOPO.test(c) && !FORA.test(c));
encerrar(procurar(arquivos, CRYPT), 'crypt( fora das funções de conta das migrations (G-02)');
