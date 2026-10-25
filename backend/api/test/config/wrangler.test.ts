import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMINHO_WRANGLER, lerWranglerDoRepositorio, lerWranglerJsonc } from '../apoio/wrangler.ts';

interface LimiteTaxa {
  name: string;
  namespace_id: string;
  simple: { limit: number; period: number };
}

interface Wrangler {
  name: string;
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
  assets: { directory: string; not_found_handling: string; run_worker_first: string[] };
  hyperdrive: { binding: string; id: string; localConnectionString: string }[];
  ratelimits: LimiteTaxa[];
  routes: { pattern: string; custom_domain?: boolean }[];
  vars: Record<string, string>;
}

const config = lerWranglerDoRepositorio<Wrangler>();

// Recursos que o Worker pode declarar. Qualquer outro (KV, D1, R2, filas, Durable Objects...) exige decisão nova.
const PERMITIDAS = new Set([
  'name',
  'main',
  'compatibility_date',
  'compatibility_flags',
  'assets',
  'hyperdrive',
  'ratelimits',
  'routes',
  'vars',
]);

/** Devolve as chaves fora da lista fechada (raiz e `env.*`); lança se o texto não for JSONC. */
function chavesForaDaLista(texto: string): string[] {
  const lido = lerWranglerJsonc(texto);
  const fora: string[] = [];
  const conferir = (objeto: Record<string, unknown>, prefixo: string): void => {
    for (const chave of Object.keys(objeto)) if (chave !== 'env' && !PERMITIDAS.has(chave)) fora.push(prefixo + chave);
  };
  conferir(lido, '');
  const ambientes = (lido['env'] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [nome, ambiente] of Object.entries(ambientes)) conferir(ambiente, `env.${nome}.`);
  return fora;
}

/** Data máxima aceita pelo workerd que o @cloudflare/vitest-plugin instalado usa (versão `1.AAAAMMDD.n`). */
function dataDoWorkerdDoPlugin(): string {
  const plugin = realpathSync(join(import.meta.dirname, '../../node_modules/@cloudflare/vitest-plugin'));
  const miniflare = createRequire(join(plugin, 'package.json')).resolve('miniflare');
  const { version } = createRequire(miniflare)('workerd/package.json') as { version: string };
  const partes = /^1\.(\d{4})(\d{2})(\d{2})\./.exec(version);
  if (!partes) throw new Error(`versão do workerd fora do formato: ${version}`);
  return `${partes[1]}-${partes[2]}-${partes[3]}`;
}

describe('wrangler.jsonc', () => {
  it('é o Worker gestaodapelada com a entrada da API', () => {
    expect(config.name).toBe('gestaodapelada');
    expect(config.main).toBe('backend/api/src/entrada/worker.ts');
  });

  it('serve os assets do web como SPA e manda só /api/* para o Worker, com nodejs_compat (FUN-19)', () => {
    expect(config.assets).toEqual({
      directory: 'frontend/web/dist',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    });
    expect(config.compatibility_flags).toContain('nodejs_compat');
  });

  it('declara LIMITE_ENTRAR 10/min, LIMITE_PUBLICO 60/min e LIMITE_WEBHOOK (FUN-26)', () => {
    const porNome = new Map(config.ratelimits.map((l) => [l.name, l]));
    expect(porNome.get('LIMITE_ENTRAR')?.simple).toEqual({ limit: 10, period: 60 });
    expect(porNome.get('LIMITE_PUBLICO')?.simple).toEqual({ limit: 60, period: 60 });
    expect(porNome.get('LIMITE_WEBHOOK')?.simple.period).toBe(60);
    expect(porNome.get('LIMITE_WEBHOOK')?.simple.limit).toBeGreaterThan(0);
    expect(config.ratelimits).toHaveLength(3);
    // Cada limitador tem o próprio contador.
    expect(new Set(config.ratelimits.map((l) => l.namespace_id)).size).toBe(3);
  });

  it('publica a rota gestaodapelada.ljssoftware.com.br como domínio próprio (FUN-27)', () => {
    expect(config.routes).toEqual([{ pattern: 'gestaodapelada.ljssoftware.com.br', custom_domain: true }]);
  });

  it('tem um único binding HYPERDRIVE, local sem senha no arquivo e como pelada_app (FUN-18, FUN-04)', () => {
    expect(config.hyperdrive).toHaveLength(1);
    const [hd] = config.hyperdrive;
    expect(hd?.binding).toBe('HYPERDRIVE');
    expect(hd?.id).toMatch(/^[0-9a-f]{32}$/);
    const local = new URL(hd?.localConnectionString ?? '');
    expect(local.hostname).toBe('localhost');
    expect(local.username).toBe('pelada_app');
    expect(local.password).toBe('');
  });

  it('URL_PUBLICA e VERSAO têm valor local; o deploy é que injeta os reais (FUN-22, FUN-20)', () => {
    expect(config.vars['URL_PUBLICA']).toBe('http://localhost:8787');
    expect(config.vars['VERSAO']).toBeTruthy();
  });

  it('compatibility_date é a data máxima do workerd do @cloudflare/vitest-plugin', () => {
    expect(config.compatibility_date).toBe(dataDoWorkerdDoPlugin());
  });

  describe('lista fechada de chaves', () => {
    it('o arquivo do repositório só usa recursos permitidos', () => {
      expect(chavesForaDaLista(readFileSync(CAMINHO_WRANGLER, 'utf8'))).toEqual([]);
    });

    it.each(['kv_namespaces', 'd1_databases', 'r2_buckets', 'durable_objects', 'queues', 'ai', 'limits', 'placement'])(
      'barra %s na raiz e dentro de env',
      (chave) => {
        expect(chavesForaDaLista(`{ "name": "x", "${chave}": [] }`)).toEqual([chave]);
        expect(chavesForaDaLista(`{ "name": "x", "env": { "teste": { "${chave}": [] } } }`)).toEqual([
          `env.teste.${chave}`,
        ]);
      },
    );

    it('chave só em comentário não conta', () => {
      expect(chavesForaDaLista('{ // "kv_namespaces": []\n "name": "x" }')).toEqual([]);
    });

    it('JSONC inválido ou vazio falha fechado', () => {
      expect(() => chavesForaDaLista('{ name: ')).toThrow();
      expect(() => chavesForaDaLista('')).toThrow();
    });
  });
});
