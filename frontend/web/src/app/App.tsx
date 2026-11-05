import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { criarRotas } from './rotas.tsx';

/**
 * Raiz do app (FUN-31): os provedores comuns a todas as telas e o roteador (T52).
 */
export function App() {
  // Um cliente e um roteador por montagem: nos testes, cada render começa do zero.
  const [cliente] = useState(() => new QueryClient());
  const [roteador] = useState(() => createBrowserRouter(criarRotas()));
  return (
    <QueryClientProvider client={cliente}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>
  );
}
