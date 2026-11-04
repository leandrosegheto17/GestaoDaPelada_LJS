import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Rotas } from './app/rotas.tsx';

const clienteDeConsultas = new QueryClient();

/** Raiz do app: consultas, roteador e rotas. */
export function App() {
  return (
    <QueryClientProvider client={clienteDeConsultas}>
      <BrowserRouter>
        <Rotas />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
