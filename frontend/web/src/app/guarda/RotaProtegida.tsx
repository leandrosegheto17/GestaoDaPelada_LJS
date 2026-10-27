import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessao } from '../../dados/sessao';
import { decidirRota } from './decidir-rota';

/**
 * Guarda das rotas com regra de sessão. Carregando: não mostra nada. Falha de rede ou servidor ao ler a
 * sessão: deixa a tela filha abrir (o pedido dela também falha e mostra o erro padrão).
 */
export function RotaProtegida() {
  const { pathname, search } = useLocation();
  const sessao = useSessao();
  if (sessao.isPending) return null;
  if (sessao.isError) return <Outlet />;
  const redirecionar = decidirRota(sessao.data, { pathname, search });
  return redirecionar ? <Navigate to={redirecionar} replace /> : <Outlet />;
}
