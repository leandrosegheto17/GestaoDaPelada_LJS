import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '../src/App.tsx';

test('FUN-31: o App renderiza sem erro no jsdom', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Gestão da Pelada' })).toBeInTheDocument();
});
