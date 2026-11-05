import { useCallback, useState } from 'react';

/**
 * Quando mostrar a instrução de instalação do iPhone (FUN-36): Safari do iOS (ou iPadOS) fora
 * do modo standalone, e só enquanto a pessoa não dispensou o aviso.
 */

export interface AmbienteNavegador {
  userAgent: string;
  /** `navigator.maxTouchPoints`: o iPadOS se apresenta como Mac, mas tem toque. */
  pontosDeToque: number;
  /** `navigator.standalone` (só existe no iOS) ou `display-mode: standalone`. */
  standalone: boolean;
}

export const CHAVE_DISPENSA = 'pelada.aviso-instalar-iphone';

/** Outros navegadores no iOS: Chrome, Firefox, Edge, Opera, Google app e navegadores embutidos. */
const OUTROS_NAVEGADORES_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram/;

export function ehSafariIos({ userAgent, pontosDeToque }: AmbienteNavegador): boolean {
  const iphoneOuIpad = /iPhone|iPad|iPod/.test(userAgent);
  const ipadComoMac = /Macintosh/.test(userAgent) && pontosDeToque > 1;
  if (!iphoneOuIpad && !ipadComoMac) return false;
  if (OUTROS_NAVEGADORES_IOS.test(userAgent)) return false;
  return /Safari\//.test(userAgent);
}

export function deveMostrarAviso(ambiente: AmbienteNavegador, dispensado: boolean): boolean {
  return !dispensado && !ambiente.standalone && ehSafariIos(ambiente);
}

export function lerAmbiente(): AmbienteNavegador {
  const nav = navigator as Navigator & { standalone?: boolean };
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return {
    userAgent: nav.userAgent,
    pontosDeToque: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || displayMode,
  };
}

/** O armazenamento pode faltar ou lançar (aba privada): sem ele, o aviso continua aparecendo. */
function lerDispensa(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DISPENSA) === 'dispensado';
  } catch {
    return false;
  }
}

function gravarDispensa(): void {
  try {
    window.localStorage.setItem(CHAVE_DISPENSA, 'dispensado');
  } catch {
    // Sem armazenamento, a dispensa vale só até recarregar a página.
  }
}

export function useModoInstalacao(ambiente?: AmbienteNavegador): {
  mostrarAviso: boolean;
  dispensar: () => void;
} {
  const [dispensado, setDispensado] = useState(lerDispensa);
  const [atual] = useState(() => ambiente ?? lerAmbiente());
  const dispensar = useCallback(() => {
    gravarDispensa();
    setDispensado(true);
  }, []);
  return { mostrarAviso: deveMostrarAviso(atual, dispensado), dispensar };
}
