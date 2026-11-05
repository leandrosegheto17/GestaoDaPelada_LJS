import type { SessaoEu } from '@pelada/contrato/acesso';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { EsqueletoLista } from '../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../componentes/EstadoErro.tsx';
import { ErroApi } from '../dados/cliente.ts';
import { useCliente } from '../dados/ContextoCliente.tsx';

/**
 * Sessão no front e guarda de rota (ACE-19, ACE-20, ACE-65):
 * - `useSessao()` lê `GET /api/sessao` (ACE-18). 401 não é erro de tela: `sem_sessao` é
 *   "ausente" e `sessao_expirada` é "expirada".
 * - `GuardaApp` (rotas de `/app`): sem sessão vai a `/entrar?volta=<rota pedida>`; sessão
 *   expirada vai com o aviso (`aviso=sessao-expirada`).
 * - `GuardaPublica` (`/entrar` e telas de quem ainda não entrou): com sessão vai ao destino de
 *   `volta`, se for uma rota do app, senão a `/app` (ACE-65). É assim que o login volta à rota
 *   pedida (ACE-19): a tela Entrar só invalida a consulta da sessão.
 */

export const CHAVE_SESSAO = ['sessao'] as const;
export const PARAMETRO_VOLTA = 'volta';
export const DESTINO_PADRAO = '/app';

export type EstadoSessao = { tipo: 'ativa'; sessao: SessaoEu } | { tipo: 'ausente' } | { tipo: 'expirada' };

export function useSessao() {
  const api = useCliente();
  return useQuery<EstadoSessao>({
    queryKey: CHAVE_SESSAO,
    queryFn: async () => {
      try {
        const sessao = await api.requisitar<SessaoEu>('GET', '/api/sessao', undefined, { semTratarExpiracao: true });
        return { tipo: 'ativa', sessao };
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status === 401) {
          return erro.codigo === 'sessao_expirada' ? { tipo: 'expirada' } : { tipo: 'ausente' };
        }
        throw erro;
      }
    },
    retry: false,
  });
}

/**
 * Só aceita uma rota do próprio app (`/app`, `/app/...`, `/app?...`): destino externo
 * (`//outro.site`, `https://...`), `/appx`, barra invertida ou caractere de controle cai em `/app`.
 */
export function destinoSeguro(volta: string | null | undefined): string {
  if (!volta) return DESTINO_PADRAO;
  if (!/^\/app(?:[/?#]|$)/.test(volta)) return DESTINO_PADRAO;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(volta) || volta.startsWith('/app//')) return DESTINO_PADRAO;
  return volta;
}

function paraEntrar(volta: string, expirada: boolean): string {
  const p = new URLSearchParams();
  if (expirada) p.set('aviso', 'sessao-expirada');
  p.set(PARAMETRO_VOLTA, volta);
  return `/entrar?${p.toString()}`;
}

export function GuardaApp() {
  const { data, isPending, isError, refetch } = useSessao();
  const local = useLocation();
  if (isPending) return <EsqueletoLista />;
  if (isError || !data) {
    return <EstadoErro formato="tela" titulo="Não foi possível carregar" aoTentarDeNovo={() => void refetch()} />;
  }
  if (data.tipo !== 'ativa') {
    return <Navigate to={paraEntrar(`${local.pathname}${local.search}`, data.tipo === 'expirada')} replace />;
  }
  return <Outlet />;
}

export function GuardaPublica() {
  const { data } = useSessao();
  const [parametros] = useSearchParams();
  if (data?.tipo === 'ativa') return <Navigate to={destinoSeguro(parametros.get(PARAMETRO_VOLTA))} replace />;
  // Carregando ou com erro, a tela pública aparece: ela funciona sem sessão.
  return <Outlet />;
}
