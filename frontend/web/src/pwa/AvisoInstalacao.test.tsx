import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoInstalacao } from './AvisoInstalacao';
import { PaginaProvisoria } from '../app/PaginaProvisoria';

const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const TEXTO = /Adicionar à Tela de Início/;

function ambiente(userAgent: string, standalone = false, navigatorStandalone?: boolean) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints: 5, standalone: navigatorStandalone });
  vi.stubGlobal('matchMedia', () => ({ matches: standalone }));
}

afterEach(() => vi.unstubAllGlobals());

// FUN-35
describe('AvisoInstalacao', () => {
  it('aparece no Safari do iOS fora do modo instalado', () => {
    ambiente(SAFARI_IOS);
    render(<AvisoInstalacao />);
    expect(screen.getByRole('note')).toHaveTextContent(TEXTO);
  });

  it('some quando o app já está instalado', () => {
    ambiente(SAFARI_IOS, true, true);
    render(<AvisoInstalacao />);
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('não aparece em outros navegadores', () => {
    ambiente(CHROME_ANDROID);
    render(<AvisoInstalacao />);
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('pode ser fechado', async () => {
    ambiente(SAFARI_IOS);
    render(<AvisoInstalacao />);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso de instalação' }));
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('a página provisória exibe o aviso no Safari do iOS', () => {
    ambiente(SAFARI_IOS);
    render(<PaginaProvisoria />);
    expect(screen.getByText(TEXTO)).toBeVisible();
  });
});
