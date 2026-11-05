import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App.tsx';

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('FUN-31: renderiza sem erro no jsdom', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
  });
});
