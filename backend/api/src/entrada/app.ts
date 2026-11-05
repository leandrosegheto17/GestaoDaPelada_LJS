import { Hono } from 'hono';
import type { Ambiente } from './ambiente.ts';
import { exigirCabecalhoPelada } from './middlewares/cabecalho-pelada.ts';
import { protegerRotasPublicas } from './middlewares/contexto-publico.ts';
import { semCache, semSniff } from './middlewares/cabecalhos.ts';
import { travarFinanceiro } from './middlewares/financeiro.ts';
import { limitarEscritasDeGrupo } from './middlewares/limite-escrita.ts';
import { limitarRotasDeAcesso } from './middlewares/limite-taxa.ts';
import { recursoLiberadoPadrao, travarRecursosDoPlano, type RecursoLiberado } from './middlewares/recurso.ts';
import { carregarSessao } from './middlewares/sessao.ts';
import { protegerRotasDeGrupo } from './middlewares/vinculo.ts';
import { rotasAdmins } from './rotas/admins.ts';
import { rotasConta } from './rotas/conta.ts';
import { rotasConvites } from './rotas/convites.ts';
import { rotasGrupo } from './rotas/grupo.ts';
import { rotasGrupoEstado } from './rotas/grupo-estado.ts';
import { rotasGrupos } from './rotas/grupos.ts';
import { rotasHabilidades } from './rotas/habilidades.ts';
import { rotasJogador } from './rotas/jogador.ts';
import { rotasJogadores } from './rotas/jogadores.ts';
import { rotasNotas } from './rotas/notas.ts';
import { rotasPeriodos } from './rotas/periodos.ts';
import { rotasPeriodosCorrecao } from './rotas/periodos-correcao.ts';
import { rotasPesos } from './rotas/pesos.ts';
import { rotasSimulador } from './rotas/simulador.ts';
import { rotasFinanceiroConfig } from './rotas/financeiro-config.ts';
import { rotasFinanceiroMes } from './rotas/financeiro-mes.ts';
import { rotasFinanceiroPagamentos } from './rotas/financeiro-pagamentos.ts';
import { rotasFinanceiroLancamentos } from './rotas/financeiro-lancamentos.ts';
import { devEmails } from './rotas/dev-emails.ts';
import { health } from './rotas/health.ts';
import { rotasMinhaConta } from './rotas/minha-conta.ts';
import { rotasRecuperacao } from './rotas/recuperacao.ts';
import { rotasSessao } from './rotas/sessao.ts';
import {
  ErroBancoIndisponivel,
  MENSAGEM_BANCO_INDISPONIVEL,
  type OpcoesCliente,
} from '../infraestrutura/db/cliente.ts';
import { relogioDoSistema, type Relogio } from '../infraestrutura/relogio.ts';

export interface OpcoesApp {
  /** Rotas extras sob /api, só para os testes (ex.: rota que lança erro). */
  registrarExtras?: (api: Hono<Ambiente>) => void;
  /** Só para os testes: fábrica de conexões da leitura da sessão (ex.: como `pelada_app`). */
  fabricaBanco?: NonNullable<OpcoesCliente['fabrica']>;
  /** Só para os testes: relógio falso (T19). Sem ele, o do sistema. */
  relogio?: Relogio;
  /** Só para os testes: trava de plano falsa (T32 da simulador; SIM-68). Sem ela, a que libera tudo (AD-049). */
  recursoLiberado?: RecursoLiberado;
}

/**
 * App Hono das rotas /api/* (FUN-20). O resto do caminho é dos assets (SPA), pelo
 * `run_worker_first: ["/api/*"]` do wrangler.jsonc.
 */
export function criarApp(opcoes: OpcoesApp = {}): Hono<Ambiente> {
  const api = new Hono<Ambiente>().basePath('/api');
  const relogio = opcoes.relogio ?? relogioDoSistema();
  const recursoLiberado = opcoes.recursoLiberado ?? recursoLiberadoPadrao;

  // O relógio da requisição antes de tudo: só ele lê a data de regra (T19; GEL-32). A trava de plano junto (SIM-68).
  api.use('*', async (c, next) => {
    c.set('relogio', relogio);
    c.set('recursoLiberado', recursoLiberado);
    await next();
  });

  // Antes de qualquer rota, para valer também no 404 e no 500 (FUN-22).
  api.use('*', semCache, semSniff);
  // Escrita sem `X-Pelada: 1` é recusada antes de qualquer limitador (ACE-49, T18).
  api.use('*', exigirCabecalhoPelada);
  // LIMITE_ENTRAR nas rotas de acesso, antes da sessão e do banco (ACE-50, ACE-70, T19).
  limitarRotasDeAcesso(api);
  // Sessão resolvida em transação própria, antes do `comBanco` de cada rota (ACE-47, T20).
  api.use('*', carregarSessao(opcoes.fabricaBanco ? { fabrica: opcoes.fabricaBanco } : {}));
  // LIMITE_ESCRITA por conta nas escritas de /api/grupos*, antes da transação da rota (SEC-003, T23).
  api.use('*', limitarEscritasDeGrupo);
  // Rotas de grupo: sessão, transação com a conta e vínculo sob a RLS (ACE-41, T21).
  protegerRotasDeGrupo(api, opcoes.fabricaBanco ? { fabrica: opcoes.fabricaBanco } : {});
  // Rotas públicas: LIMITE_PUBLICO por IP, slug validado, conta apagada e transação só com o slug (PAR-77, PAR-78,
  // PAR-90, AD-045; partidas-e-ranking T37).
  protegerRotasPublicas(api, opcoes.fabricaBanco ? { fabrica: opcoes.fabricaBanco } : {});
  // Trava de recurso do plano depois do vínculo e do grupo ativo (SIM-68, AD-077).
  travarRecursosDoPlano(api);
  // Permissão do financeiro depois do vínculo e do grupo ativo (FIN-33, AD-077).
  travarFinanceiro(api);

  api.route('/', health);
  // Só responde com EMAIL_DEV=1; sem ela, 404 como rota inexistente (T17).
  api.route('/', devEmails);
  // Rotas de acesso (T25 em diante); a fábrica de teste vale para o banco delas também.
  const rotasAcesso = opcoes.fabricaBanco ? { fabrica: opcoes.fabricaBanco } : {};
  api.route('/', rotasConta(rotasAcesso));
  api.route('/', rotasSessao(rotasAcesso));
  api.route('/', rotasRecuperacao(rotasAcesso));
  api.route('/', rotasMinhaConta(rotasAcesso));
  api.route('/', rotasConvites(rotasAcesso));
  api.route('/', rotasAdmins(rotasAcesso));
  // Grupos (grupos-e-elenco T28 em diante).
  api.route('/', rotasGrupos(rotasAcesso));
  api.route('/', rotasGrupo());
  api.route('/', rotasGrupoEstado());
  api.route('/', rotasJogadores());
  api.route('/', rotasJogador());
  api.route('/', rotasPeriodos());
  api.route('/', rotasPeriodosCorrecao());
  api.route('/', rotasHabilidades());
  api.route('/', rotasNotas());
  // Partidas e ranking (T38 em diante da partidas-e-ranking).
  api.route('/', rotasPesos());
  // Simulador (T33 em diante da simulador).
  api.route('/', rotasSimulador());
  // Financeiro (T25 em diante da financeiro).
  api.route('/', rotasFinanceiroConfig());
  api.route('/', rotasFinanceiroMes());
  api.route('/', rotasFinanceiroPagamentos());
  api.route('/', rotasFinanceiroLancamentos());
  opcoes.registrarExtras?.(api);

  api.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404));
  api.onError((erro, c) => {
    // Banco fora: 503 com mensagem fixa, sem a URL nem o erro do driver (FUN-16).
    if (erro instanceof ErroBancoIndisponivel) return c.json({ erro: MENSAGEM_BANCO_INDISPONIVEL }, 503);
    return c.json({ erro: 'Erro interno.' }, 500);
  });

  return api;
}
