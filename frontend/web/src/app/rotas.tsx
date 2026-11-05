import type { RouteObject } from 'react-router';
import { NaoEncontrada, PaginaProvisoria } from '../paginas/Mensagens.tsx';
import { AdminsGrupo, MinhaConta, MinhaSenha } from '../paginas/acesso/provisorias.tsx';
import { GuardaApp, GuardaPublica } from './guarda.tsx';
import { Grupos } from '../telas/grupos/Grupos.tsx';
import { Convite } from '../telas/convite/Convite.tsx';
import { Privacidade, Termos } from '../telas/termos/Termos.tsx';
import { NovaSenha } from '../telas/nova-senha/NovaSenha.tsx';
import { Esqueci } from '../telas/esqueci/Esqueci.tsx';
import { Confirmar } from '../telas/confirmar/Confirmar.tsx';
import { Cadastro } from '../telas/cadastro/Cadastro.tsx';
import { Entrar } from '../telas/entrar/Entrar.tsx';

/**
 * Rotas (FUN-31, FUN-38; conta e acesso, T42):
 * - `/` com a página provisória (AD-007), que mostra a faixa "Sua conta foi excluída" em
 *   `?aviso=conta-excluida` (ACE-28); a landing é da `planos-e-cobranca` (AD-023);
 * - telas públicas: `/termos` e `/privacidade` abrem com ou sem sessão (ACE-58), como
 *   `/confirmar`, `/entrar/esqueci`, `/entrar/nova-senha` e `/convite` (o convite tem estado
 *   para quem já entrou, e os links de e-mail não podem perder o `#t=` num redirecionamento);
 * - `/entrar` e `/cadastro` passam pela `GuardaPublica`: quem já entrou vai a `/app` (ACE-65);
 * - `/app/*` passa pela `GuardaApp` (ACE-19, ACE-20). Rotas do `telas.json:137-187` (AD-017).
 * - `/_vitrine/:id` só com `VITE_VITRINE=1`, e `*` com o 404.
 *
 * `handle.tela` identifica cada tela (o teste das rotas confere por ele).
 *
 * A vitrine entra por `import()` dentro do `if`: no build sem a variável, o Vite troca
 * `import.meta.env.VITE_VITRINE` por `undefined`, o ramo morre e o chunk da vitrine não é
 * gerado (conferido pela busca no `dist`).
 */

export interface HandleTela {
  tela: string;
}

export function criarRotas(): RouteObject[] {
  const rotas: RouteObject[] = [
    { path: '/', element: <PaginaProvisoria />, handle: { tela: 'inicio-publico' } },
    { path: '/termos', element: <Termos />, handle: { tela: 'termos' } },
    { path: '/privacidade', element: <Privacidade />, handle: { tela: 'privacidade' } },
    { path: '/confirmar', element: <Confirmar />, handle: { tela: 'confirmar' } },
    { path: '/entrar/esqueci', element: <Esqueci />, handle: { tela: 'esqueci' } },
    { path: '/entrar/nova-senha', element: <NovaSenha />, handle: { tela: 'nova-senha' } },
    { path: '/convite', element: <Convite />, handle: { tela: 'convite' } },
    {
      element: <GuardaPublica />,
      children: [
        { path: '/entrar', element: <Entrar />, handle: { tela: 'entrar' } },
        { path: '/cadastro', element: <Cadastro />, handle: { tela: 'cadastro' } },
      ],
    },
    {
      path: '/app',
      element: <GuardaApp />,
      children: [
        { index: true, element: <Grupos />, handle: { tela: 'app' } },
        { path: 'conta', element: <MinhaConta />, handle: { tela: 'conta' } },
        { path: 'conta/senha', element: <MinhaSenha />, handle: { tela: 'senha' } },
        { path: 'grupos/:grupoId/admins', element: <AdminsGrupo />, handle: { tela: 'admins' } },
        { path: '*', element: <NaoEncontrada />, handle: { tela: 'nao-encontrada' } },
      ],
    },
  ];
  if (import.meta.env.VITE_VITRINE === '1') {
    rotas.push({
      path: '/_vitrine/:id',
      lazy: async () => {
        const { Vitrine } = await import('../vitrine/Vitrine.tsx');
        return { Component: Vitrine };
      },
    });
  }
  rotas.push({ path: '*', element: <NaoEncontrada />, handle: { tela: 'nao-encontrada' } });
  return rotas;
}
