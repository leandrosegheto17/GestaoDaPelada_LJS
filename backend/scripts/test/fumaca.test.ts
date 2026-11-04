import { expect, test } from 'vitest';
import { nome } from '../src/index.js';

test('fumaça do pacote scripts', () => {
  expect(nome).toBe('scripts');
});
