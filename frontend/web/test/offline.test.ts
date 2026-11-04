import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const html = readFileSync(join(import.meta.dirname, '..', 'public', 'offline.html'), 'utf8');

describe('página offline', () => {
  test('FUN-35: não referencia URL externa nem script', () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(?:src|href)=["']\/\//i);
  });

  test('FUN-35: só usa var(--...) de tokens, sem cor literal', () => {
    const estilo = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1])
      .join('\n');
    expect(estilo).toContain('var(--');
    expect(estilo).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(estilo).not.toMatch(/\b(?:rgb|hsl)a?\(/i);
  });

  test('FUN-35: tem lang pt-BR, título e uma landmark main', () => {
    expect(html).toMatch(/<html[^>]*lang="pt-BR"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html.match(/<main[\s>]/g)).toHaveLength(1);
  });
});
