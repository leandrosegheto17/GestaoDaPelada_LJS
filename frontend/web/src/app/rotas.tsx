import type { RouteObject } from 'react-router';
import { PaginaProvisoria } from './PaginaProvisoria';

/**
 * Rotas de vitrine (FUN-37): só existem quando o build é feito com `VITE_VITRINE=1` (build de teste, usado na
 * comparação visual). No build de produção a condição é falsa na compilação e o módulo da vitrine nem é empacotado.
 */
export const rotasVitrine: RouteObject[] =
  import.meta.env.VITE_VITRINE === '1'
    ? [
        {
          path: '/vitrine/*',
          lazy: async () => ({ Component: (await import('../vitrine/Vitrine')).Vitrine }),
        },
      ]
    : [];

export function criarRotas(extras: RouteObject[] = rotasVitrine): RouteObject[] {
  return [{ path: '/', Component: PaginaProvisoria }, ...extras];
}
