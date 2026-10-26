// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/basicos/voltar-erro-envio.test.tsx

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { ErroEnvio } from './ErroEnvio';
import { Voltar } from './Voltar';

describe('Voltar', () => {
  it('é um link com o rótulo e a seta decorativa', async () => {
    const { container } = render(
      <MemoryRouter>
        <Voltar para="/" rotulo="Voltar ao ranking" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Voltar ao ranking' })).toHaveAttribute('href', '/');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('ErroEnvio', () => {
  it('é um alerta com o texto de falha de conexão', async () => {
    const { container } = render(<ErroEnvio />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível enviar. Verifique a conexão.');
    expect(await violacoes(container)).toEqual([]);
  });
});
