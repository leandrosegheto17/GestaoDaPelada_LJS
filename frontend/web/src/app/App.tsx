import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { criarCliente } from '../dados/cliente.ts';
import { ProvedorCliente } from '../dados/ContextoCliente.tsx';
import { criarRotas } from './rotas.tsx';

/**
 * Raiz do app (FUN-31): os provedores comuns a todas as telas e o roteador (T52). O cliente
 * HTTP (T36) limpa este cache e navega por este roteador quando a sessão expira (ACE-20).
 */
export function App() {
  // Um cliente e um roteador por montagem: nos testes, cada render começa do zero.
  const [consultas] = useState(() => new QueryClient());
  const [roteador] = useState(() => createBrowserRouter(criarRotas()));
  const [api] = useState(() =>
    criarCliente({ consultas, navegar: (destino) => void roteador.navigate(destino) }),
  );
  return (
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={api}>
        <RouterProvider router={roteador} />
      </ProvedorCliente>
    </QueryClientProvider>
  );
}
