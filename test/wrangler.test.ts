import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerJsonc, semComentarios } from './apoio/jsonc.ts';

const RAIZ = join(import.meta.dirname, '..');

interface Limite {
  name: string;
  namespace_id: string;
  simple: { limit: number; period: number };
}

interface Wrangler {
  name: string;
  main: string;
  workers_dev: boolean;
  routes: Array<{ pattern: string; custom_domain?: boolean }>;
  compatibility_flags: string[];
  assets: { directory: string; not_found_handling: string; run_worker_first: string[] };
  ratelimits: Limite[];
  hyperdrive: { binding: string; id: string; localConnectionString: string }[];
  queues?: {
    producers: Array<{ binding: string; queue: string }>;
    consumers: Array<{ queue: string; max_batch_size?: number; max_retries?: number }>;
  };
  triggers?: { crons: string[] };
  vars: Record<string, string>;
}

const config = lerJsonc<Wrangler>(join(RAIZ, 'wrangler.jsonc'));

/** Todas as chaves do objeto, em qualquer profundidade. */
function chaves(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chaves);
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [k, ...chaves(v)]);
  }
  return [];
}

describe('leitor de JSONC', () => {
  it('tira comentários de linha e de bloco sem tocar em // dentro de string', () => {
    const texto = '// topo\n{ "url": "postgres://h/b", /* bloco */ "n": 1 // fim\n}';
    expect(JSON.parse(semComentarios(texto))).toEqual({ url: 'postgres://h/b', n: 1 });
  });
});

describe('wrangler.jsonc da prévia', () => {
  it('FUN-20: assets do build do web como SPA, com /api/* passando antes pelo Worker', () => {
    expect(config.assets).toEqual({
      directory: 'frontend/web/dist',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    });
    expect(config.compatibility_flags).toContain('nodejs_compat');
    expect(config.main).toBe('backend/api/src/entrada/worker.ts');
  });

  it('FUN-26: os 4 bindings de limite com 10, 60, 60 e 60 por minuto', () => {
    const porNome = Object.fromEntries(config.ratelimits.map((l) => [l.name, l.simple]));
    expect(porNome).toEqual({
      LIMITE_ENTRAR: { limit: 10, period: 60 },
      LIMITE_PUBLICO: { limit: 60, period: 60 },
      LIMITE_WEBHOOK: { limit: 60, period: 60 },
      LIMITE_ESCRITA: { limit: 60, period: 60 },
    });
    const ids = config.ratelimits.map((l) => l.namespace_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('FUN-27: Worker gestaodapelada-v2 no workers.dev e só com o domínio da AD-121', () => {
    expect(config.name).toBe('gestaodapelada-v2');
    expect(config.workers_dev).toBe(true);
    expect(config.routes).toEqual([
      { pattern: 'gestaodapelada.ljssoftware.com.br', custom_domain: true },
    ]);
    const todas = chaves(config);
    for (const proibida of ['route', 'zone_name', 'zone_id']) {
      expect(todas, proibida).not.toContain(proibida);
    }
  });

  it('FUN-27: Hyperdrive com o id real (hex de 32 caracteres, sem o marcador) e conexão local sem senha', () => {
    expect(config.hyperdrive).toHaveLength(1);
    const [h] = config.hyperdrive;
    expect(h?.binding).toBe('HYPERDRIVE');
    expect(h?.id).toMatch(/^[0-9a-f]{32}$/);
    expect(h?.id).not.toBe('PREENCHER');
    const local = new URL(h?.localConnectionString ?? '');
    expect(local.hostname).toBe('127.0.0.1');
    expect(local.username).toBe('pelada_app');
    expect(local.password).toBe('');
  });

  it('FUN-23: VERSAO e URL_PUBLICA existem nas vars e URL_PUBLICA não traz endereço fixo', () => {
    // PLA-38 (T40): a variável ASAAS_URL entra nas vars, sempre no sandbox do Asaas.
    expect(Object.keys(config.vars).sort()).toEqual(['ASAAS_URL', 'URL_PUBLICA', 'VERSAO']);
    expect(config.vars.URL_PUBLICA).toBe('');
    expect(config.vars.ASAAS_URL).toBe('https://api-sandbox.asaas.com/v3');
  });

  it('NOT-22: fila avisos com produtor FILA_AVISOS e consumidor de 1 mensagem por invocação e 2 novas entregas', () => {
    expect(config.queues).toEqual({
      producers: [{ binding: 'FILA_AVISOS', queue: 'avisos' }],
      consumers: [{ queue: 'avisos', max_batch_size: 1, max_retries: 2 }],
    });
    // A fila não traz rota nem zona: o FUN-27 acima continua valendo com ela.
    expect(chaves(config.queues)).not.toContain('route');
  });

  it('NOT-56, NOT-57: o Cron da limpeza roda uma vez por dia às 06:00 UTC, dentro dos 5 Crons do plano Free', () => {
    expect(config.triggers).toEqual({ crons: ['0 6 * * *'] });
    expect(config.triggers?.crons.length).toBeLessThanOrEqual(5);
  });
});
