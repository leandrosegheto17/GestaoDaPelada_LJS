import { useCallback, useState } from 'react';

export const CHAVE_AVISO_DISPENSADO = 'pelada:aviso-instalar-dispensado';

interface NavegadorIos extends Navigator {
  standalone?: boolean;
}

/** Safari do iOS (iPhone, iPad, iPod) fora do app instalado: o único caso em que o aviso faz sentido (FUN-36). */
export function ehSafariIosForaDoApp(): boolean {
  const nav = navigator as NavegadorIos;
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent);
  const safari = /Safari/.test(nav.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(nav.userAgent);
  const instalado =
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  return ios && safari && !instalado;
}

function jaDispensado(): boolean {
  try {
    return localStorage.getItem(CHAVE_AVISO_DISPENSADO) === '1';
  } catch {
    return false;
  }
}

/** Diz se o aviso de instalação deve aparecer e guarda a escolha de dispensá-lo. */
export function useModoInstalacao(): { mostrar: boolean; dispensar: () => void } {
  const [dispensado, setDispensado] = useState(jaDispensado);
  const dispensar = useCallback(() => {
    try {
      localStorage.setItem(CHAVE_AVISO_DISPENSADO, '1');
    } catch {
      // sem armazenamento (modo privado): o aviso some só nesta visita
    }
    setDispensado(true);
  }, []);
  return { mostrar: !dispensado && ehSafariIosForaDoApp(), dispensar };
}
