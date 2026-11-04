import { expect, test } from 'vitest';
import { nome } from '../src/index.js';

test('fumaça do pacote dominio', () => {
  expect(nome).toBe('dominio');
});
