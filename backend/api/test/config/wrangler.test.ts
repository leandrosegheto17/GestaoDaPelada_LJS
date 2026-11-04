import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';

const raiz = resolve(import.meta.dirname, '../../../..');

interface Wrangler {
  name?: string;
  workers_dev?: boolean;
  routes?: unknown;
  route?: unknown;
  compatibility_flags?: string[];
  assets?: { directory?: string; not_found_handling?: string; run_worker_first?: string[] };
  ratelimits?: { name: string; namespace_id: string; simple: { limit: number; period: number } }[];
  hyperdrive?: { binding: string; id: string; localConnectionString?: string }[];
  vars?: Record<string, string>;
}

const texto = readFileSync(resolve(raiz, 'wrangler.jsonc'), 'utf8');
const config = parse(texto) as Wrangler;

describe('wrangler.jsonc da prévia', () => {
  it('FUN-20: serve os assets do build como SPA e passa /api/* primeiro pelo Worker', () => {
    expect(config.assets?.directory).toBe('frontend/web/dist');
    expect(config.assets?.not_found_handling).toBe('single-page-application');
    expect(config.assets?.run_worker_first).toEqual(['/api/*']);
    expect(config.compatibility_flags).toContain('nodejs_compat');
  });

  it('FUN-26: declara os 4 bindings de rate limit com 10, 60, 60 e 60 por minuto', () => {
    const limites = Object.fromEntries(
      (config.ratelimits ?? []).map((l) => [l.name, [l.simple.limit, l.simple.period]]),
    );
    expect(limites).toEqual({
      LIMITE_ENTRAR: [10, 60],
      LIMITE_PUBLICO: [60, 60],
      LIMITE_WEBHOOK: [60, 60],
      LIMITE_ESCRITA: [60, 60],
    });
    const ids = (config.ratelimits ?? []).map((l) => l.namespace_id);
    expect(new Set(ids).size).toBe(4);
  });

  it('FUN-27: Worker gestaodapelada-v2 na prévia, sem rota nem domínio próprio', () => {
    expect(config.name).toBe('gestaodapelada-v2');
    expect(config.workers_dev).toBe(true);
    expect(config).not.toHaveProperty('routes');
    expect(config).not.toHaveProperty('route');
    expect(texto).not.toContain('custom_domain');
  });

  it('FUN-27: Hyperdrive HYPERDRIVE com marcador PREENCHER até o ID real e vars VERSAO e URL_PUBLICA', () => {
    expect(config.hyperdrive).toHaveLength(1);
    expect(config.hyperdrive?.[0]?.binding).toBe('HYPERDRIVE');
    expect(config.hyperdrive?.[0]?.id).toBe('PREENCHER');
    expect(config.hyperdrive?.[0]?.localConnectionString).toBeTruthy();
    expect(Object.keys(config.vars ?? {}).sort()).toEqual(['URL_PUBLICA', 'VERSAO']);
  });
});
