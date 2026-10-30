import type { RouteObject } from 'react-router';
import { RotaProtegida } from './guarda/RotaProtegida';
import { PaginaErroDeRota, PaginaNaoEncontrada } from './PaginaNaoEncontrada';
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

/**
 * Rotas do app (design C7). Cada tela carrega sob demanda. Só `/entrar` (ACE-65) e `/app` (ACE-19) passam pela
 * guarda de sessão; `/termos`, `/privacidade` e as telas de link por e-mail abrem sem sessão (ACE-58).
 */
export function criarRotas(extras: RouteObject[] = rotasVitrine): RouteObject[] {
  return [
    {
      errorElement: <PaginaErroDeRota />,
      children: [
        { path: '/', Component: PaginaProvisoria },
        {
          Component: RotaProtegida,
          children: [
            {
              path: '/entrar',
              lazy: async () => ({ Component: (await import('../telas/entrar/Entrar')).Entrar }),
            },
            {
              path: '/app',
              lazy: async () => ({ Component: (await import('../telas/grupos/SeusGrupos')).SeusGrupos }),
            },
            {
              path: '/app/conta',
              lazy: async () => ({ Component: (await import('../telas/minha-conta/MinhaConta')).MinhaConta }),
            },
            {
              path: '/app/conta/senha',
              lazy: async () => ({ Component: (await import('../telas/minha-senha/MinhaSenha')).MinhaSenha }),
            },
            // grupos-e-elenco (GEL-114): as telas do grupo e do elenco. A rota do início (t09) foi ligada antes da T68.
            {
              path: '/app/grupos/novo',
              lazy: async () => ({ Component: (await import('../telas/novo-grupo/NovoGrupo')).NovoGrupo }),
            },
            {
              path: '/app/grupos/:grupoId',
              lazy: async () => ({ Component: (await import('../telas/grupo/InicioDoGrupo')).InicioDoGrupo }),
            },
            {
              path: '/app/grupos/:grupoId/dados',
              lazy: async () => ({ Component: (await import('../telas/dados-grupo/DadosDoGrupo')).DadosDoGrupo }),
            },
            {
              path: '/app/grupos/:grupoId/jogadores',
              lazy: async () => ({ Component: (await import('../telas/jogadores/Jogadores')).Jogadores }),
            },
            {
              path: '/app/grupos/:grupoId/jogadores/novo',
              lazy: async () => ({ Component: (await import('../telas/jogador/NovoJogador')).NovoJogador }),
            },
            {
              path: '/app/grupos/:grupoId/jogadores/:jogadorId',
              lazy: async () => ({ Component: (await import('../telas/jogador/FichaJogador')).FichaJogador }),
            },
            {
              path: '/app/grupos/:grupoId/habilidades',
              lazy: async () => ({ Component: (await import('../telas/habilidades/Habilidades')).Habilidades }),
            },
            {
              path: '/app/grupos/:grupoId/admins',
              lazy: async () => ({ Component: (await import('../telas/admins/PaginaAdmins')).PaginaAdmins }),
            },
          ],
        },
        {
          path: '/cadastro',
          lazy: async () => ({ Component: (await import('../telas/cadastro/Cadastro')).Cadastro }),
        },
        {
          path: '/confirmar',
          lazy: async () => ({ Component: (await import('../telas/confirmar/Confirmar')).Confirmar }),
        },
        {
          path: '/entrar/esqueci',
          lazy: async () => ({ Component: (await import('../telas/esqueci/EsqueciSenha')).EsqueciSenha }),
        },
        {
          path: '/entrar/nova-senha',
          lazy: async () => ({ Component: (await import('../telas/nova-senha/NovaSenha')).NovaSenha }),
        },
        {
          path: '/convite',
          lazy: async () => ({ Component: (await import('../telas/convite/Convite')).Convite }),
        },
        {
          path: '/termos',
          lazy: async () => ({ Component: (await import('../telas/termos/PaginaTermos')).PaginaTermos }),
        },
        {
          path: '/privacidade',
          lazy: async () => ({
            Component: (await import('../telas/privacidade/PaginaPrivacidade')).PaginaPrivacidade,
          }),
        },
        ...extras,
        { path: '*', Component: PaginaNaoEncontrada },
      ],
    },
  ];
}
