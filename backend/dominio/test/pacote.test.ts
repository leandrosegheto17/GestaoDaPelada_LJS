import { describe, expect, it } from 'vitest';
import pacote from '../package.json' with { type: 'json' };

describe('@pelada/dominio (FUN-01)', () => {
  it('é um módulo ESM com o nome do workspace', () => {
    expect(pacote.type).toBe('module');
    expect(pacote.name).toBe('@pelada/dominio');
  });
});
