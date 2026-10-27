import type { Generated } from 'kysely';

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
}

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

export interface TabelaGrupos {
  id: Generated<string>;
  nome: string;
  slug: string;
  arquivado_em: Date | null;
}

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
