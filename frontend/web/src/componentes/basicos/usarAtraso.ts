import { useEffect, useState } from 'react';

/** Vira `true` depois de `ms` (evita piscar o esqueleto em respostas rápidas). */
export function usarAtraso(ms = 300): boolean {
  const [passou, setPassou] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPassou(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return passou;
}
