import type { ColumnType, Generated, GeneratedAlways } from 'kysely';

/**
 * Tabelas do banco vistas pelo Kysely. Cada feature acrescenta as tabelas que usar; o resto continua por `sql`.
 * Só entram as colunas que a pelada_app pode ler: `contas.senha_hash` fica de fora (grant de coluna, ACE-44).
 */
export interface Banco {
  contas: TabelaContas;
  sessoes: TabelaSessoes;
  grupos: TabelaGrupos;
  vinculos_admin: TabelaVinculosAdmin;
  convites_admin: TabelaConvitesAdmin;
  auditoria: TabelaAuditoria;
  jogadores: TabelaJogadores;
  periodos_ativos: TabelaPeriodosAtivos;
  habilidades: TabelaHabilidades;
  notas: TabelaNotas;
  // Só leitura nesta feature (histórico do jogador e presença dentro do período).
  presencas: TabelaPresencas;
  partidas: TabelaPartidas;
  pagamentos_mes: TabelaPagamentosMes;
}

/** Leitura sem escrita pelo Kysely: inserir e alterar não compilam. */
type SoLeitura<T> = { [K in keyof T]: ColumnType<T[K], never, never> };

export interface TabelaContas {
  id: Generated<string>;
  email: string;
  nome: string;
  senha_temporaria: boolean;
  e_dono: boolean;
  aviso_privacidade_visto_em: Date | null;
  criada_em: Date;
  email_confirmado_em: Date | null;
  termos_versao: string | null;
  termos_aceitos_em: Date | null;
  excluida_em: Date | null;
}

export interface TabelaSessoes {
  id: Generated<string>;
  token_hash: Uint8Array;
  conta_id: string;
  escopo: 'completo' | 'troca_de_senha';
  criada_em: Date;
  ultimo_uso_em: Date;
  expira_em: Date;
}

export type DiaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
export type Frequencia = 'semanal' | 'quinzenal' | 'mensal';
export type Posicao = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'atacante' | 'centroavante';

/**
 * `grupos` (linha de base). A pelada_app só altera nome, dia_semana, frequencia, horario e arquivado_em (grant por
 * coluna, T20); o grupo nasce pela função `grupo_criar`. `horario` (time) volta como texto `HH:MM:SS`.
 */
export interface TabelaGrupos {
  id: Generated<string>;
  nome: string;
  slug: ColumnType<string, string, never>;
  dia_semana: DiaSemana;
  frequencia: Frequencia;
  horario: string;
  arquivado_em: Date | null;
  criado_por: ColumnType<string, string, never>;
  criado_em: ColumnType<Date, Date | string, never>;
  situacao_comercial: ColumnType<string, string | undefined, never>;
  trial_inicio: ColumnType<string | null, string | null | undefined, never>;
}

/** `date` volta como texto `AAAA-MM-DD` (transação da requisição). */
export interface TabelaJogadores {
  id: Generated<string>;
  grupo_id: string;
  apelido: string;
  ano_nascimento: number | null;
  posicao: Posicao | null;
  telefone: string | null;
  pontuacao_inicial: Generated<number>;
  inicio_pontuacao: string | null;
  criado_por: string;
  criado_em: Date;
  alterado_por: string;
  alterado_em: Date;
}

/** Período de atividade `[inicio, fim)`; aberto = `fim` nulo (único por jogador, `periodos_um_aberto`). */
export interface TabelaPeriodosAtivos {
  id: Generated<string>;
  grupo_id: string;
  jogador_id: string;
  inicio: string;
  fim: string | null;
}

export interface TabelaHabilidades {
  id: Generated<string>;
  grupo_id: string;
  nome: string;
  /** Identity always: a ordem de criação. */
  ordem: GeneratedAlways<string>;
}

export interface TabelaNotas {
  grupo_id: string;
  jogador_id: string;
  habilidade_id: string;
  valor: number;
}

export type TabelaPresencas = SoLeitura<{
  partida_id: string;
  jogador_id: string;
  grupo_id: string;
  situacao: 'presente' | 'lesionado' | 'expulso';
}>;

export type TabelaPartidas = SoLeitura<{
  id: string;
  grupo_id: string;
  data: string;
  choveu: boolean;
  criada_por: string;
  criada_em: Date;
  alterada_por: string;
  alterada_em: Date;
}>;

export type TabelaPagamentosMes = SoLeitura<{
  grupo_id: string;
  jogador_id: string;
  mes: string;
  lancamento_id: string | null;
  marcado_por: string;
  marcado_em: Date;
}>;

export interface TabelaVinculosAdmin {
  conta_id: string;
  grupo_id: string;
  acessa_financeiro: boolean;
  criado_por: string;
  criado_em: Date;
}

export interface TabelaConvitesAdmin {
  id: Generated<string>;
  grupo_id: string;
  email: string;
  token_hash: Uint8Array;
  criado_por: string;
  criado_em: Date;
  expira_em: Date;
  usado_em: Date | null;
  cancelado_em: Date | null;
}

export interface TabelaAuditoria {
  id: Generated<string>;
  autor_tipo: 'conta' | 'infraestrutura';
  autor_conta_id: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  grupo_id: string | null;
  momento: Date;
  resumo: Generated<unknown>;
}
