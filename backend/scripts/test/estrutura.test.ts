import { describe, expect, it } from 'vitest';
import tsconfig from '../tsconfig.json' with { type: 'json' };

describe('backend/scripts (FUN-01)', () => {
  it('herda o TypeScript estrito da base', () => {
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });
});
