import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { criarClienteConsultas, ROTA_SESSAO_EXPIRADA } from '../dados/consultas';
import { criarRotas } from './rotas';

const roteador = createBrowserRouter(criarRotas());
// Sessão vencida no meio do uso: o cliente limpa o cache e a pessoa volta a /entrar com o aviso (ACE-20).
const consultas = criarClienteConsultas({
  aoSessaoExpirada: () => void roteador.navigate(ROTA_SESSAO_EXPIRADA, { replace: true }),
});

export function App() {
  return (
    <QueryClientProvider client={consultas}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>
  );
}
