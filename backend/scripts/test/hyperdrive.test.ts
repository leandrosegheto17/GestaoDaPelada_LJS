import { describe, expect, test } from 'vitest';
import { conferirHyperdrive, conferirSemCache } from '../ops/hyperdrive.ts';

const config = (caching: unknown) => JSON.stringify({ id: 'abc', name: 'pelada-dev', caching });

describe('conferirSemCache', () => {
  test('FUN-18: caching.disabled verdadeiro passa', () => {
    expect(conferirSemCache(config({ disabled: true }))).toEqual({
      ok: true,
      mensagem: 'Hyperdrive com o cache desligado.',
    });
  });

  test.each([
    ['disabled falso', config({ disabled: false })],
    ['caching sem disabled', config({ max_age: 60 })],
    ['caching ausente', JSON.stringify({ id: 'abc' })],
    ['disabled como texto', config({ disabled: 'true' })],
  ])('FUN-18: %s reprova com mensagem clara', (_nome, json) => {
    const r = conferirSemCache(json);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('--caching-disabled');
  });

  test.each([
    ['vazio', ''],
    ['texto que não é JSON', 'wrangler: command not found'],
    ['JSON truncado', '{"caching": {"disabled": tr'],
    ['JSON que não é objeto', '42'],
    ['null', 'null'],
  ])('FUN-18: JSON inválido (%s) reprova sem lançar erro', (_nome, json) => {
    const r = conferirSemCache(json);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/JSON/);
  });
});

describe('conferirHyperdrive (comando)', () => {
  test('FUN-18: lê a saída do wrangler e passa com o cache desligado', () => {
    const r = conferirHyperdrive('id-1', () => ({ status: 0, stdout: config({ disabled: true }) }));
    expect(r.ok).toBe(true);
  });

  test('FUN-18: cache ligado reprova', () => {
    const r = conferirHyperdrive('id-1', () => ({
      status: 0,
      stdout: config({ disabled: false }),
    }));
    expect(r.ok).toBe(false);
  });

  test('FUN-18: falha do wrangler reprova, com o motivo e sem lançar', () => {
    const r = conferirHyperdrive('id-1', () => ({
      status: 1,
      stdout: '',
      stderr: 'não autenticado',
    }));
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('não autenticado');
  });

  test('FUN-18: sem o ID do Hyperdrive ou com o marcador PREENCHER reprova', () => {
    expect(conferirHyperdrive('', () => ({ status: 0, stdout: '' })).ok).toBe(false);
    expect(conferirHyperdrive('PREENCHER', () => ({ status: 0, stdout: '' })).ok).toBe(false);
  });
});
