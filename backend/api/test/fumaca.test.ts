import { expect, test } from 'vitest';
import { nome } from '../src/index.js';

test('fumaça do pacote api', () => {
  expect(nome).toBe('api');
});
