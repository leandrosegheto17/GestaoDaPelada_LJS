import { expect, test } from 'vitest';
import { nome } from '../src/index.js';

test('fumaça: o pacote carrega', () => {
  expect(nome).toBe('@pelada/dominio');
});
