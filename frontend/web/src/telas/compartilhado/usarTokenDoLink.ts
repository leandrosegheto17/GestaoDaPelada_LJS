import { useEffect, useRef, useState } from 'react';
import { lerTokenDoFragmento } from '../../dados/fragmento';

/**
 * Lê o token do link do e-mail (`#t=`) uma única vez e apaga o fragmento da URL (AD-010).
 * `pronto` fica falso até a leitura; `token` é nulo quando o link não trouxe token.
 * A guarda por `useRef` evita ler de novo no segundo disparo do efeito do StrictMode (o fragmento já foi apagado).
 */
export function usarTokenDoLink(): { pronto: boolean; token: string | null } {
  const lido = useRef(false);
  const [estado, setEstado] = useState<{ pronto: boolean; token: string | null }>({ pronto: false, token: null });
  useEffect(() => {
    if (lido.current) return;
    lido.current = true;
    setEstado({ pronto: true, token: lerTokenDoFragmento() });
  }, []);
  return estado;
}
