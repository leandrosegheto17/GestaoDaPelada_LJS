import type { RouteObject } from 'react-router';
import { NaoEncontrada, PaginaProvisoria } from '../paginas/Mensagens.tsx';

/**
 * Rotas da fundação (FUN-31, FUN-38): `/` com a página provisória (AD-007), `*` com o 404 e,
 * só com `VITE_VITRINE=1`, `/_vitrine/:id`.
 *
 * A vitrine entra por `import()` dentro do `if`: no build sem a variável, o Vite troca
 * `import.meta.env.VITE_VITRINE` por `undefined`, o ramo morre e o chunk da vitrine não é
 * gerado (conferido pela busca no `dist`).
 */
export function criarRotas(): RouteObject[] {
  const rotas: RouteObject[] = [{ path: '/', element: <PaginaProvisoria /> }];
  if (import.meta.env.VITE_VITRINE === '1') {
    rotas.push({
      path: '/_vitrine/:id',
      lazy: async () => {
        const { Vitrine } = await import('../vitrine/Vitrine.tsx');
        return { Component: Vitrine };
      },
    });
  }
  rotas.push({ path: '*', element: <NaoEncontrada /> });
  return rotas;
}
