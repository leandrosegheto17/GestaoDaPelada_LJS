import type { RouteObject } from 'react-router';
import { NaoEncontrada } from '../paginas/Mensagens.tsx';
import { PaginaRanking } from '../telas/ranking/PaginaRanking.tsx';
import { PaginaPartidas } from '../telas/partidas/PaginaPartidas.tsx';
import { PaginaNovaPartida } from '../telas/partida/PaginaNovaPartida.tsx';
import { PaginaEditarPartida } from '../telas/partida/PaginaEditarPartida.tsx';
import { PaginaPontuacao } from '../telas/pontuacao/PaginaPontuacao.tsx';
import { PaginaUso } from '../telas/uso/PaginaUso.tsx';
import { PaginaSimulador } from '../telas/simulador/PaginaSimulador.tsx';
import { Landing } from '../telas/landing/Landing.tsx';
import { Admins } from '../telas/admins/Admins.tsx';
import { MinhaSenha } from '../telas/minha-senha/MinhaSenha.tsx';
import { MinhaConta } from '../telas/minha-conta/MinhaConta.tsx';
import { GuardaApp, GuardaPublica } from './guarda.tsx';
import { Grupos } from '../telas/grupos/Grupos.tsx';
import { Convite } from '../telas/convite/Convite.tsx';
import { Privacidade, Termos } from '../telas/termos/Termos.tsx';
import { NovaSenha } from '../telas/nova-senha/NovaSenha.tsx';
import { Esqueci } from '../telas/esqueci/Esqueci.tsx';
import { Confirmar } from '../telas/confirmar/Confirmar.tsx';
import { Cadastro } from '../telas/cadastro/Cadastro.tsx';
import { Entrar } from '../telas/entrar/Entrar.tsx';
import { NovoGrupo } from '../telas/novo-grupo/NovoGrupo.tsx';
import { InicioGrupo } from '../telas/grupo/InicioGrupo.tsx';
import { DadosGrupo } from '../telas/dados-grupo/DadosGrupo.tsx';
import { Jogadores } from '../telas/jogadores/Jogadores.tsx';
import { NovoJogador } from '../telas/jogador/NovoJogador.tsx';
import { FichaJogador } from '../telas/jogador/FichaJogador.tsx';
import { Habilidades } from '../telas/habilidades/Habilidades.tsx';
import { ConfigCaixa } from '../telas/financeiro/ConfigCaixa.tsx';
import { FinanceiroMes } from '../telas/financeiro/FinanceiroMes.tsx';
import { Lancamento } from '../telas/financeiro/Lancamento.tsx';

/**
 * Rotas (FUN-31, FUN-38; conta e acesso, T42):
 * - `/` com a landing (planos-e-cobranca T53; AD-023, AD-094), que mostra a faixa "Sua conta foi
 *   excluída" em `?aviso=conta-excluida` (ACE-28, PLA-63). Fica sob a `GuardaPublica`: com sessão
 *   vai a `/app` (PLA-64); carregando a sessão, ou com `GET /api/sessao` em erro, a landing
 *   aparece inteira (PLA-65), porque ela não depende da API;
 * - telas públicas: `/termos` e `/privacidade` abrem com ou sem sessão (ACE-58), como
 *   `/confirmar`, `/entrar/esqueci`, `/entrar/nova-senha` e `/convite` (o convite tem estado
 *   para quem já entrou, e os links de e-mail não podem perder o `#t=` num redirecionamento);
 * - `/entrar` e `/cadastro` passam pela `GuardaPublica`: quem já entrou vai a `/app` (ACE-65);
 * - `/app/*` passa pela `GuardaApp` (ACE-19, ACE-20). Rotas do `telas.json:137-187` (AD-017);
 *   as de grupos e elenco (grupos-e-elenco T69, GEL-114, `telas.json:188-227`): novo grupo, início
 *   do grupo, dados, jogadores, novo jogador, ficha e habilidades. `grupos/novo` vem antes de
 *   `grupos/:grupoId` só por clareza: o roteador já prefere o segmento fixo. Grupo ou jogador que a
 *   API não acha (404) mostra o não encontrado da própria tela;
 * - financeiro (financeiro T37; FIN-47, AD-054): o mês do caixa, novo lançamento, lançamento e configurar caixa, em
 *   `/app/grupos/:grupoId/financeiro…`. `lancamentos/novo` vem antes de `lancamentos/:lancamentoId` só por clareza;
 * - partidas e ranking (partidas-e-ranking T58; PAR-143): `/g/:slug` (t01, t03) fora das guardas, aberto com ou sem
 *   sessão; e, sob a `GuardaApp`, as partidas do mês, nova partida, partida por data, pontuação e uso do app;
 *   `partidas/nova` vem antes de `partidas/:data` só por clareza;
 * - simulador (simulador T51; SIM-84): `/app/grupos/:grupoId/simulador`, sob a `GuardaApp`;
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
    { path: '/termos', element: <Termos />, handle: { tela: 'termos' } },
    { path: '/privacidade', element: <Privacidade />, handle: { tela: 'privacidade' } },
    { path: '/confirmar', element: <Confirmar />, handle: { tela: 'confirmar' } },
    { path: '/entrar/esqueci', element: <Esqueci />, handle: { tela: 'esqueci' } },
    { path: '/entrar/nova-senha', element: <NovaSenha />, handle: { tela: 'nova-senha' } },
    { path: '/convite', element: <Convite />, handle: { tela: 'convite' } },
    { path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } },
    {
      element: <GuardaPublica />,
      children: [
        { path: '/', element: <Landing />, handle: { tela: 'inicio-publico' } },
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
        { path: 'grupos/novo', element: <NovoGrupo />, handle: { tela: 'novo-grupo' } },
        { path: 'grupos/:grupoId', element: <InicioGrupo />, handle: { tela: 'inicio-grupo' } },
        { path: 'grupos/:grupoId/dados', element: <DadosGrupo />, handle: { tela: 'dados-grupo' } },
        { path: 'grupos/:grupoId/admins', element: <Admins />, handle: { tela: 'admins' } },
        { path: 'grupos/:grupoId/jogadores', element: <Jogadores />, handle: { tela: 'jogadores' } },
        { path: 'grupos/:grupoId/jogadores/novo', element: <NovoJogador />, handle: { tela: 'novo-jogador' } },
        { path: 'grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador />, handle: { tela: 'jogador' } },
        { path: 'grupos/:grupoId/habilidades', element: <Habilidades />, handle: { tela: 'habilidades' } },
        { path: 'grupos/:grupoId/financeiro', element: <FinanceiroMes />, handle: { tela: 'financeiro' } },
        { path: 'grupos/:grupoId/financeiro/lancamentos/novo', element: <Lancamento />, handle: { tela: 'novo-lancamento' } },
        { path: 'grupos/:grupoId/financeiro/lancamentos/:lancamentoId', element: <Lancamento />, handle: { tela: 'lancamento' } },
        { path: 'grupos/:grupoId/financeiro/config', element: <ConfigCaixa />, handle: { tela: 'config-caixa' } },
        // Partidas e ranking (T58; PAR-143), com as telas das T59 a T63.
        { path: 'grupos/:grupoId/partidas', element: <PaginaPartidas />, handle: { tela: 'partidas' } },
        { path: 'grupos/:grupoId/partidas/nova', element: <PaginaNovaPartida />, handle: { tela: 'nova-partida' } },
        { path: 'grupos/:grupoId/partidas/:data', element: <PaginaEditarPartida />, handle: { tela: 'partida' } },
        { path: 'grupos/:grupoId/pontuacao', element: <PaginaPontuacao />, handle: { tela: 'pontuacao' } },
        { path: 'grupos/:grupoId/uso', element: <PaginaUso />, handle: { tela: 'uso' } },
        // Simulador (simulador T51; SIM-84): entradas (t12) e resultado (t13, t14) na mesma rota.
        { path: 'grupos/:grupoId/simulador', element: <PaginaSimulador />, handle: { tela: 'simulador' } },
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
