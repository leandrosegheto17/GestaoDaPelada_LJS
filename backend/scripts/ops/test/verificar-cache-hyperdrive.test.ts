// Critério: FUN-18 (cache do Hyperdrive desligado, conferido no deploy).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cacheDoHyperdriveDesligado, main, origemDoHyperdriveNoNeon } from '../verificar-cache-hyperdrive.ts';

const script = fileURLToPath(new URL('../verificar-cache-hyperdrive-cli.ts', import.meta.url));

const rodar = (stdin: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { input: stdin, encoding: 'utf8', timeout: 60_000 });

const resposta = (result: unknown, success: unknown = true) => JSON.stringify({ success, errors: [], result });
// Origem como a API devolve (sem a senha): conexão direta do Neon, role pelada_app (ADR-032).
const ORIGEM = {
  host: 'ep-calmo-rio-123456.sa-east-1.aws.neon.tech',
  port: 5432,
  database: 'pelada',
  user: 'pelada_app',
  scheme: 'postgres',
};

describe('cacheDoHyperdriveDesligado', () => {
  it('passa com caching.disabled === true (formato da API)', () => {
    const corpo = resposta({ id: 'e06363bd85874f1eaffc6382da6d394b', name: 'x', caching: { disabled: true } });
    expect(() => cacheDoHyperdriveDesligado(corpo)).not.toThrow();
  });

  it.each([
    ['cache ligado', resposta({ caching: { disabled: false } })],
    ['caching ausente', resposta({ name: 'x' })],
    ['caching vazio', resposta({ caching: {} })],
    ['disabled como texto', resposta({ caching: { disabled: 'true' } })],
    ['disabled numérico', resposta({ caching: { disabled: 1 } })],
    ['result nulo', resposta(null)],
    ['result vazio', resposta({})],
    ['result lista', resposta([])],
    ['success false', resposta({ caching: { disabled: true } }, false)],
    ['success ausente', JSON.stringify({ result: { caching: { disabled: true } } })],
    [
      'erro da API',
      JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }], result: null }),
    ],
    ['corpo vazio', ''],
    ['null', 'null'],
    ['objeto vazio', '{}'],
    ['lista', '[]'],
    ['JSON inválido', '<html>502 Bad Gateway</html>'],
  ])('falha fechado: %s', (_nome, corpo) => {
    expect(() => cacheDoHyperdriveDesligado(corpo)).toThrow();
  });

  it('a mensagem de erro não carrega o corpo recebido', () => {
    expect(() => cacheDoHyperdriveDesligado('segredo-xyz')).toThrow(/não é JSON/);
    try {
      cacheDoHyperdriveDesligado('segredo-xyz');
    } catch (e) {
      expect((e as Error).message).not.toContain('segredo-xyz');
    }
  });
});

describe('origemDoHyperdriveNoNeon (ADR-032)', () => {
  it('passa com a conexão direta do Neon e a role pelada_app', () => {
    expect(() => origemDoHyperdriveNoNeon(resposta({ caching: { disabled: true }, origin: ORIGEM }))).not.toThrow();
  });

  it.each([
    ['origem ausente', resposta({ caching: { disabled: true } })],
    ['origem nula', resposta({ caching: { disabled: true }, origin: null })],
    ['pooler', resposta({ origin: { ...ORIGEM, host: 'ep-calmo-rio-123456-pooler.sa-east-1.aws.neon.tech' } })],
    ['host local', resposta({ origin: { ...ORIGEM, host: 'localhost' } })],
    ['fora do Neon', resposta({ origin: { ...ORIGEM, host: 'banco.exemplo.com' } })],
    ['owner como origem (bypassrls)', resposta({ origin: { ...ORIGEM, user: 'pelada_owner' } })],
    ['usuário ausente', resposta({ origin: { ...ORIGEM, user: undefined } })],
    ['JSON inválido', '<html>502</html>'],
  ])('falha fechado: %s', (_nome, corpo) => {
    expect(() => origemDoHyperdriveNoNeon(corpo)).toThrow();
  });
});

describe('main', () => {
  it('sem --executar devolve 1 sem ler o stdin', () => {
    const lerStdin = () => {
      throw new Error('não deveria ler');
    };
    expect(main([], lerStdin)).toBe(1);
  });
});

describe('módulo importado sem a CLI', () => {
  it('não executa nada nem chama process.exit', () => {
    const modulo = fileURLToPath(new URL('../verificar-cache-hyperdrive.ts', import.meta.url));
    const r = spawnSync(
      process.execPath,
      ['-e', `import(${JSON.stringify(pathToFileURL(modulo).href)}).then(() => console.log('importado-ok'))`],
      { input: '', encoding: 'utf8', timeout: 60_000 },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('importado-ok');
    expect(r.stderr).toBe('');
  });
});

describe('ponto de entrada sem condição por ambiente (texto dos arquivos)', () => {
  const lerTexto = (nome: string) => readFileSync(fileURLToPath(new URL(`../${nome}`, import.meta.url)), 'utf8');
  const arquivos = ['verificar-cache-hyperdrive-cli.ts', 'verificar-cache-hyperdrive.ts'];

  it.each(arquivos)('%s não usa import.meta.main nem process.argv[1]', (nome) => {
    const texto = lerTexto(nome);
    expect(texto).not.toMatch(/import\.meta\.main/);
    expect(texto).not.toMatch(/process\.argv\s*\[\s*1\s*\]/);
  });

  it.each(arquivos)('%s não condiciona process.exit( a um if', (nome) => {
    expect(lerTexto(nome)).not.toMatch(/\bif\b[^;]*?process\.exit\s*\(/);
  });

  const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const instrucaoFinal = 'process.exit(main(process.argv.slice(2)));';

  it('a CLI chama process.exit(main(process.argv.slice(2))) incondicionalmente', () => {
    const codigo = semComentarios(lerTexto('verificar-cache-hyperdrive-cli.ts')).replace(/\s+/g, ' ').trim();
    expect(codigo).toBe(`import { main } from './verificar-cache-hyperdrive.ts'; ${instrucaoFinal}`);
  });

  it('a CLI não tem bloco, palavra de controle, import.meta nem process.argv fora da instrução final', () => {
    const codigo = semComentarios(lerTexto('verificar-cache-hyperdrive-cli.ts'))
      .replace("import { main } from './verificar-cache-hyperdrive.ts';", '')
      .replace(instrucaoFinal, '');
    expect(codigo.trim()).toBe('');
    expect(codigo).not.toMatch(/[{}]|\bimport\s*\.\s*meta\b|\bprocess\b|\bargv\b/);
    expect(codigo).not.toMatch(/\b(if|else|try|catch|switch|for|while|do|case)\b/);
  });
});

describe('script como processo', () => {
  // Motivo da mudança (ADR-032): o deploy passa a conferir também a origem; a resposta válida traz a origem.
  const valido = resposta({ caching: { disabled: true }, origin: ORIGEM });

  it.each([
    ['cache ligado', resposta({ caching: { disabled: false } })],
    ['lixo', '<html>502</html>'],
    ['vazio', ''],
    ['objeto vazio', '{}'],
    [
      'cache desligado e origem no pooler',
      resposta({ caching: { disabled: true }, origin: { ...ORIGEM, host: 'ep-x-pooler.sa-east-1.aws.neon.tech' } }),
    ],
    ['cache desligado sem origem', resposta({ caching: { disabled: true } })],
  ])('com --executar e stdin %s sai com 1', (_nome, stdin) => {
    expect(rodar(stdin, '--executar').status).toBe(1);
  });

  it('com --executar e stdin válido sai com 0', () => {
    expect(rodar(valido, '--executar').status).toBe(0);
  });

  it.each([
    ['válido', valido],
    ['cache ligado', resposta({ caching: { disabled: false } })],
    ['vazio', ''],
  ])('sem --executar nunca sai com 0 (stdin %s)', (_nome, stdin) => {
    const r = rodar(stdin);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Uso:');
  });
});
