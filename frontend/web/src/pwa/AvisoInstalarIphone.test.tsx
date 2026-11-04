import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvisoInstalarIphone } from './AvisoInstalarIphone.tsx';
import { CHAVE_AVISO_DISPENSADO } from './useModoInstalacao.ts';

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const UA_CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';

function ambiente(userAgent: string, standalone: boolean) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('AvisoInstalarIphone', () => {
  it('FUN-36: com user agent de iPhone e standalone falso, o aviso aparece', () => {
    ambiente(UA_IPHONE, false);
    render(<AvisoInstalarIphone />);
    expect(screen.getByRole('note')).toHaveTextContent('Adicionar à Tela de Início');
  });

  it.each([
    ['em standalone no iPhone', UA_IPHONE, true],
    ['no Android', UA_ANDROID, false],
    ['no desktop', UA_DESKTOP, false],
    ['no Chrome do iOS', UA_CHROME_IOS, false],
  ])('FUN-36: %s o aviso não aparece', (_nome, ua, standalone) => {
    ambiente(ua, standalone);
    render(<AvisoInstalarIphone />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: dispensar grava a escolha e o aviso não volta', async () => {
    ambiente(UA_IPHONE, false);
    const { unmount } = render(<AvisoInstalarIphone />);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso de instalação' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem(CHAVE_AVISO_DISPENSADO)).toBe('1');
    unmount();
    render(<AvisoInstalarIphone />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: axe sem violações', async () => {
    ambiente(UA_IPHONE, false);
    const { container } = render(<AvisoInstalarIphone />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
