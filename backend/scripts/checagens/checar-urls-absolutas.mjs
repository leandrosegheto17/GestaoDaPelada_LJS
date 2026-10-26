import { arquivosVersionados, encerrar, procurar } from './arquivos.mjs';

const RAIZ = process.argv[2] ?? process.cwd();
const ESCOPO = /^(backend|frontend|\.github)\/|^[^/]+$/;
const FORA =
  /^(\.md|\.claude)\/|^pnpm-lock\.yaml$|\/node_modules\/|(^|\/)(test|e2e|config)\/|\.test\.[a-z]+$|\.md$|^wrangler\.jsonc$/;
// FUN-22: o domínio do app só aparece na configuração permitida (wrangler.jsonc); a fonte no código é URL_PUBLICA.
const URL_ABSOLUTA = /[a-z][a-z0-9+.-]*:\/\/|(["'`])\/\/[a-z0-9-]+\.[a-z]{2,}|workers\.dev|ljssoftware\.com\.br/i;

// Exceções explícitas: espaços de nomes e esquemas que não são endereço de serviço.
const EXCECOES = [
  'http://localhost',
  'postgres://pelada:pelada@localhost',
  'postgres://postgres:postgres@localhost',
  'postgres://postgres:postgres@db:5432',
  'http://backend:8787',
  'https://console.neon.tech/api/v2',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://json-schema.org/',
  'https://json-schema.org/',
  'https://schemastore.org/',
  'https://json.schemastore.org/',
  'https://biomejs.dev/',
  'https://developers.cloudflare.com/',
  'https://pnpm.io/',
];

const arquivos = arquivosVersionados(RAIZ, (c) => ESCOPO.test(c) && !FORA.test(c));
// As exceções valem para a linha inteira: o achado impresso é truncado e perderia a URL permitida.
const achados = procurar(arquivos, URL_ABSOLUTA, EXCECOES);
encerrar(achados, 'URL absoluta no código (G-18)');
