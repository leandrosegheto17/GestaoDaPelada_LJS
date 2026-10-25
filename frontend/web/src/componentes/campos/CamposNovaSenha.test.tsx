// Critério: FUN-30 (componentes base: renderização e axe; CampoMoeda e NavegadorMes dependem desta formatação). Copiado do legado: frontend/web/src/componentes/campos/CamposNovaSenha.test.tsx

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { CamposNovaSenha } from './CamposNovaSenha';

const nada = () => undefined;

describe('CamposNovaSenha', () => {
  it('ajuda da regra ligada ao campo, autocomplete new-password e sem botÃ£o Mostrar', () => {
    render(<CamposNovaSenha nova="" confirmacao="" aoMudarNova={nada} aoMudarConfirmacao={nada} erros={{}} />);
    const nova = screen.getByLabelText('Nova senha');
    expect(nova).toHaveAccessibleDescription('De 8 a 72 caracteres.');
    expect(nova).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
  });

  it('erros aparecem na descriÃ§Ã£o do campo e sem violaÃ§Ãµes do axe', async () => {
    const { container } = render(
      <CamposNovaSenha
        nova=""
        confirmacao=""
        aoMudarNova={nada}
        aoMudarConfirmacao={nada}
        erros={{ novaSenha: 'Muito curta.', confirmacao: 'As senhas nÃ£o conferem.' }}
      />,
    );
    expect(screen.getByLabelText('Nova senha')).toHaveAccessibleDescription('De 8 a 72 caracteres. Muito curta.');
    expect(screen.getByLabelText('Confirmar nova senha')).toBeInvalid();
    expect(await violacoes(container)).toEqual([]);
  });
});
