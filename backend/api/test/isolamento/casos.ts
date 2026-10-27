import type { IdsDoGrupo } from '../apoio/cenario-dois-grupos.ts';

export interface Caso {
  /** Coluna que liga a linha ao grupo (`id` em `grupos`, `grupo_id` nas demais). */
  coluna: 'id' | 'grupo_id';
  /**
   * `sem-grant`: tabela com grupo_id que pelada_app ainda não acessa (a `conta-e-acesso` define os grants).
   * Nela, toda leitura e escrita é recusada por privilégio, para qualquer conta.
   */
  acesso: 'negocio' | 'sem-grant';
  /** INSERT de uma linha nova no grupo `g`, usando entidades desse grupo. */
  inserir(g: IdsDoGrupo): [string, unknown[]];
}

const conta = (g: IdsDoGrupo) => g.conta;

/** Um caso de isolamento por tabela com grupo_id (e por `grupos`). O meta-teste exige um caso para cada uma. */
export const CASOS: Record<string, Caso> = {
  grupos: {
    coluna: 'id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ($1, 'Intruso', 'intruso', 'quarta', 'semanal', '20:00', $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  vinculos_admin: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
      ['00000000-0000-0000-0000-000000000099', g.grupo],
    ],
  },
  jogadores: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'Intruso', $2, now(), $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  periodos_ativos: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      "INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2025-01-01', '2025-02-01')",
      [g.jogador, g.grupo],
    ],
  },
  habilidades: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => ["INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Intrusa')", [g.grupo]],
  },
  notas: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      'INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 1)',
      [g.jogador, g.habilidade, g.grupo],
    ],
  },
  config_pesos: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                                 lesionado_com_chuva, expulso, registrado_por, registrado_em)
       VALUES ($1, '2026-06-01', 1, 1, 1, 1, 1, $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  partidas: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
       VALUES ($1, '2026-10-28', $2, now(), $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  presencas: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      "INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'lesionado')",
      [g.partida, g.jogador, g.grupo],
    ],
  },
  escalacoes: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
       VALUES ($1, '2026-10-28', 'dois_times', 5, '{}', $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  config_financeira: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO config_financeira (grupo_id, saldo_inicial_centavos, data_saldo_inicial)
       VALUES ($1, 0, '2026-01-01')`,
      [g.grupo],
    ],
  },
  lancamentos: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em,
                                alterado_por, alterado_em)
       VALUES ($1, 'saida', '2026-10-02', 'Intrusa', 100, $2, now(), $2, now())`,
      [g.grupo, conta(g)],
    ],
  },
  pagamentos_mes: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, marcado_por, marcado_em)
       VALUES ($1, $2, '2026-09', $3, now())`,
      [g.grupo, g.jogador, conta(g)],
    ],
  },
  auditoria: {
    coluna: 'grupo_id',
    acesso: 'sem-grant',
    inserir: (g) => [
      `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, grupo_id, momento)
       VALUES ('conta', $1, 'intrusa', 'grupo', $2, now())`,
      [conta(g), g.grupo],
    ],
  },
  convites_admin: {
    coluna: 'grupo_id',
    acesso: 'negocio',
    inserir: (g) => [
      `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
       VALUES ($1, 'intruso@exemplo.com', digest('intruso-' || $3, 'sha256'), $2, now(), now() + interval '7 days')`,
      [g.grupo, conta(g), g.slug],
    ],
  },
  eventos_uso: {
    coluna: 'grupo_id',
    acesso: 'sem-grant',
    inserir: (g) => [
      "INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), '2026-10-28')",
      [g.grupo],
    ],
  },
};

export interface CasoConta {
  /**
   * `propria`: pelada_app lê só as linhas da conta da sessão (pela `coluna`).
   * `sem-grant`: pelada_app não lê nem escreve; só as funções SECURITY DEFINER tocam a tabela.
   */
  acesso: 'propria' | 'sem-grant';
  /** Coluna que liga a linha à conta (`id` em `contas`, `conta_id` em `sessoes`). Só no acesso `propria`. */
  coluna?: 'id' | 'conta_id';
}

/** Tabelas de conta, sem grupo_id (ACE-43 a ACE-45): isolamento por conta, com duas contas. */
export const CASOS_CONTA: Record<string, CasoConta> = {
  contas: { acesso: 'propria', coluna: 'id' },
  sessoes: { acesso: 'propria', coluna: 'conta_id' },
  tentativas_login: { acesso: 'sem-grant' },
  links_conta: { acesso: 'sem-grant' },
  envios_email: { acesso: 'sem-grant' },
  pedidos_reset: { acesso: 'sem-grant' },
};

/**
 * Caso de cada rota registrada no Hono (G-04, ACE-48). `grupo`: rota de dado de grupo, sob
 * `/api/grupos/:grupoId/`, atrás do `exigirVinculo`. `nao_se_aplica`: rota pública ou de sessão, com o motivo.
 */
export type CasoRota = { tipo: 'grupo' } | { tipo: 'nao_se_aplica'; motivo: string };

/** Chave: `MÉTODO /caminho`, como o Hono registra. O meta-teste exige um caso para cada rota e vice-versa. */
export const CASOS_ROTAS: Record<string, CasoRota> = {
  'GET /api/health': { tipo: 'nao_se_aplica', motivo: 'Saúde do serviço: não lê dado de grupo nem de conta.' },
  'POST /api/sessao/entrar': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: entra com e-mail e senha pela função do banco; não lê dado de grupo.',
  },
  'GET /api/sessao': {
    tipo: 'nao_se_aplica',
    motivo: 'Dado da própria conta da sessão (RLS por conta) e os grupos em que ela tem vínculo; não é rota de grupo.',
  },
  'POST /api/conta': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: cria a conta pela função do banco; sem dado de grupo.',
  },
  'POST /api/conta/confirmar': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: consome o link de confirmação pela função do banco; sem dado de grupo.',
  },
  'POST /api/conta/reenviar-confirmacao': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: pede novo link pela função do banco; sem dado de grupo.',
  },
  'POST /api/sessao/esqueci-senha': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: pede o link de recuperação pela função do banco; sem dado de grupo.',
  },
  'POST /api/sessao/nova-senha': {
    tipo: 'nao_se_aplica',
    motivo: 'Sem sessão: consome o link de recuperação pela função do banco; sem dado de grupo.',
  },
  'POST /api/sessao/sair': { tipo: 'nao_se_aplica', motivo: 'Apaga a sessão da própria conta (RLS por conta).' },
};
