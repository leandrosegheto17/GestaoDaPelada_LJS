import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { criarRotas } from './rotas';

const roteador = createBrowserRouter(criarRotas());

export function App() {
  return <RouterProvider router={roteador} />;
}
