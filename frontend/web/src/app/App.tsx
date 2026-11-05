import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Raiz do app (FUN-31): os provedores comuns a todas as telas. As rotas entram na T52.
 */
export function App() {
  // Um cliente por montagem: nos testes, cada render começa sem cache.
  const [cliente] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={cliente}>
      <main>
        <h1>Gestão da Pelada</h1>
      </main>
    </QueryClientProvider>
  );
}
