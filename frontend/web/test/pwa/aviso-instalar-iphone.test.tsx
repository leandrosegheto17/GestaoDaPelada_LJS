import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AvisoInstalarIphone, TEXTO_AVISO } from '../../src/pwa/AvisoInstalarIphone.tsx';
import { CHAVE_DISPENSA, deveMostrarAviso, type AmbienteNavegador } from '../../src/pwa/useModoInstalacao.ts';
import { esperarSemViolacoes } from '../apoio/axe.ts';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadComoMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
};

const amb = (userAgent: string, standalone = false, pontosDeToque = 5): AmbienteNavegador => ({
  userAgent,
  standalone,
  pontosDeToque,
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('AvisoInstalarIphone', () => {
  it('FUN-36: com user agent de iPhone e standalone falso, o aviso aparece', () => {
    render(<AvisoInstalarIphone ambiente={amb(UA.iphoneSafari)} />);
    expect(screen.getByRole('note').textContent).toContain(TEXTO_AVISO);
  });

  it('FUN-36: em standalone, o aviso não aparece', () => {
    render(<AvisoInstalarIphone ambiente={amb(UA.iphoneSafari, true)} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: no Android, o aviso não aparece', () => {
    render(<AvisoInstalarIphone ambiente={amb(UA.android)} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: no desktop (Windows e Mac sem toque), o aviso não aparece', () => {
    render(<AvisoInstalarIphone ambiente={amb(UA.desktop, false, 0)} />);
    expect(screen.queryByRole('note')).toBeNull();
    cleanup();
    render(<AvisoInstalarIphone ambiente={amb(UA.macSafari, false, 0)} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: no iPad que se apresenta como Mac (com toque), o aviso aparece', () => {
    expect(deveMostrarAviso(amb(UA.ipadComoMac, false, 5), false)).toBe(true);
  });

  it('FUN-36: no Chrome do iPhone (não é o Safari), o aviso não aparece', () => {
    expect(deveMostrarAviso(amb(UA.iphoneChrome), false)).toBe(false);
  });

  it('FUN-36: dispensar o aviso grava a escolha e ele não volta', () => {
    const { unmount } = render(<AvisoInstalarIphone ambiente={amb(UA.iphoneSafari)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso de instalação' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(window.localStorage.getItem(CHAVE_DISPENSA)).toBe('dispensado');
    unmount();
    render(<AvisoInstalarIphone ambiente={amb(UA.iphoneSafari)} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FUN-36: axe sem violações', async () => {
    const { container } = render(<AvisoInstalarIphone ambiente={amb(UA.iphoneSafari)} />);
    await esperarSemViolacoes(container);
  });
});
