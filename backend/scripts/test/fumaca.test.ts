import { describe, expect, it } from 'vitest';
import { PACOTE } from '../src/index.ts';

describe('@pelada/scripts', () => {
  it('FUN-02: o pacote carrega e o teste de fumaça roda', () => {
    expect(PACOTE).toBe('@pelada/scripts');
  });
});
