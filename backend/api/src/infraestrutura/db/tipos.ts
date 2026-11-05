import type { ColumnType, Generated } from 'kysely';

/**
 * Tipos Kysely das tabelas da grupos-e-elenco (T21; GEL-112), do modelo de `GD:220-236` e das migrações (linha de base
 * e `1792844*`). Só o que as rotas da feature leem ou escrevem: `grupos` completo, o elenco (`jogadores`,
 * `periodos_ativos`, `habilidades`, `notas`) e, só leitura, `partidas` e `presencas` (as presenças das regras de
 * período, GEL-68); a partidas-e-ranking (T80) as torna graváveis e acrescenta `config_pesos` e `eventos_uso` (só de
 * inserção). `pagamentos_mes` nasceu só leitura (o histórico que impede excluir, GEL-85); o financeiro (T11) a
 * torna gravável junto de `config_financeira` e `lancamentos`.
 *
 * `COLUNAS_TIPADAS` repete as colunas com o tipo do catálogo (`udt_name`) para o teste conferir contra o banco
 * migrado; o `satisfies` amarra as duas listas no typecheck.
 *
 * Datas (`date`): o driver `pg` sem parser devolve `Date` no fuso do processo; os repositórios leem `date` como texto
 * (`coluna::text`, `AAAA-MM-DD`) e escrevem texto, por isso o tipo é `string`.
 */

/** `date` lido e escrito como `AAAA-MM-DD`. */
type Data = ColumnType<string, string, string>;
/** `timestamptz` gravado pelo SQL (`now()` ou o instante do relógio). */
type Instante = ColumnType<Date, Date | string, Date | string>;

export interface TabelaGrupos {
  id: Generated<string>;
  nome: string;
  /** Imutável (GEL-16): o grant por coluna não deixa o `pelada_app` mudar. */
  slug: ColumnType<string, string, never>;
  dia_semana: string;
  frequencia: string;
  /** `time`: o `pg` devolve `HH:MM:SS`. */
  horario: string;
  situacao_comercial: ColumnType<string, string | undefined, never>;
  trial_inicio: ColumnType<string | null, string | null | undefined, never>;
  arquivado_em: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  criado_por: ColumnType<string, string, never>;
  criado_em: ColumnType<Date, Date | string, never>;
}

export interface TabelaJogadores {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  apelido: string;
  /** Anulável no banco pela anonimização (LGPD); o contrato exige no cadastro. */
  ano_nascimento: number | null;
  posicao: string | null;
  telefone: string | null;
  pontuacao_inicial: ColumnType<number, number | undefined, number>;
  /** Nula = início do primeiro período. Só a criação e a rota de início escrevem (GEL-83). */
  inicio_pontuacao: ColumnType<string | null, string | null | undefined, string | null>;
  criado_por: ColumnType<string, string, never>;
  criado_em: ColumnType<Date, Date | string, never>;
  alterado_por: string;
  alterado_em: Instante;
}

export interface TabelaPeriodosAtivos {
  id: Generated<string>;
  jogador_id: ColumnType<string, string, never>;
  grupo_id: ColumnType<string, string, never>;
  inicio: Data;
  fim: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface TabelaHabilidades {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  nome: string;
  /** Identity: a ordem de cadastro (GEL-88). */
  ordem: ColumnType<string, never, never>;
}

export interface TabelaNotas {
  jogador_id: ColumnType<string, string, never>;
  habilidade_id: ColumnType<string, string, never>;
  grupo_id: ColumnType<string, string, never>;
  valor: number;
}

/**
 * Partidas e presenças (T80 da partidas-e-ranking; PAR-62), de `M:1792843200000_linha-de-base.sql:169-191`. Deixam de
 * ser só leitura: o lançamento e a edição gravam. Como no grant por coluna (T25), só `choveu`, `alterada_por` e
 * `alterada_em` mudam numa partida; `grupo_id`, `data` e a criação ficam fixos (`never` no UPDATE).
 */
export interface TabelaPartidas {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  data: ColumnType<string, string, never>;
  choveu: ColumnType<boolean, boolean | undefined, boolean>;
  criada_por: ColumnType<string, string, never>;
  criada_em: ColumnType<Date, Date | string, never>;
  alterada_por: string;
  alterada_em: Instante;
}

/** Só `presente`, `lesionado` e `expulso` gravam linha (PAR-23); a edição troca as presenças (apaga e insere). */
export interface TabelaPresencas {
  partida_id: ColumnType<string, string, never>;
  jogador_id: ColumnType<string, string, never>;
  grupo_id: ColumnType<string, string, never>;
  situacao: 'presente' | 'lesionado' | 'expulso';
}

/**
 * Configuração de pesos (T80; PAR-62), de `M:1792843200000_linha-de-base.sql:155-167` e `:287`. A coluna `expulso` é o
 * peso do expulso **sem chuva** (nome do legado); `expulso_com_chuva` é o com chuva. `grupo_id` e `vigente_desde` não
 * mudam (grant por coluna da T25): salvar no mesmo dia é `ON CONFLICT (grupo_id, vigente_desde) DO UPDATE` dos pesos.
 */
export interface TabelaConfigPesos {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  vigente_desde: ColumnType<string, string, never>;
  presenca_sem_chuva: number;
  presenca_com_chuva: number;
  lesionado_sem_chuva: number;
  lesionado_com_chuva: number;
  /** Peso do expulso sem chuva. */
  expulso: number;
  expulso_com_chuva: number;
  registrado_por: string;
  registrado_em: Instante;
}

/** Coluna que só se grava na inserção: nunca muda (sem grant de UPDATE, T23). */
type SoInsercao<T, I = T> = ColumnType<T, I, never>;

/**
 * Eventos de uso (T80; PAR-62), de `M:1792843200000_linha-de-base.sql:194-207`: só de inserção (grant SELECT e INSERT,
 * T23). Nenhuma coluna aceita UPDATE, então `updateTable('eventos_uso')` não compila. `id` é `bigint` identity
 * (`GENERATED ALWAYS`): o `pg` o devolve como texto e ninguém o grava.
 */
export interface TabelaEventosUso {
  id: ColumnType<string, never, never>;
  grupo_id: SoInsercao<string>;
  tipo: SoInsercao<'ranking_aberto' | 'pdf_exportado' | 'partida_lancada' | 'escalacao_confirmada'>;
  momento: SoInsercao<Date, Date | string>;
  dispositivo_id: SoInsercao<string | null, string | null | undefined>;
  mes_exportado: SoInsercao<string | null, string | null | undefined>;
  data_partida: SoInsercao<string | null, string | null | undefined>;
}

/**
 * Financeiro (T11; FIN-13): as 3 tabelas são graváveis. Valores em centavos como `number` (`int4`, nunca decimal);
 * datas como texto `AAAA-MM-DD`; `lancamento_id` é anulável (marcar sem mensalidade grava só o pagamento, FIN-17).
 * Autoria e instantes não mudam depois de gravados, exceto `alterado_*` nos lançamentos.
 */
export interface TabelaConfigFinanceira {
  grupo_id: ColumnType<string, string, never>;
  mensalidade_centavos: ColumnType<number | null, number | null, number | null>;
  saldo_inicial_centavos: ColumnType<number, number, number>;
  data_saldo_inicial: Data;
}

export interface TabelaLancamentos {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  tipo: ColumnType<'entrada' | 'saida', 'entrada' | 'saida', 'entrada' | 'saida'>;
  data: Data;
  descricao: ColumnType<string, string, string>;
  valor_centavos: ColumnType<number, number, number>;
  criado_por: ColumnType<string, string, never>;
  criado_em: ColumnType<Date, Date | string, never>;
  alterado_por: ColumnType<string, string, string>;
  alterado_em: Instante;
}

export interface TabelaPagamentosMes {
  grupo_id: ColumnType<string, string, never>;
  jogador_id: ColumnType<string, string, never>;
  mes: ColumnType<string, string, never>;
  lancamento_id: ColumnType<string | null, string | null | undefined, string | null>;
  marcado_por: ColumnType<string, string, never>;
  marcado_em: ColumnType<Date, Date | string, never>;
}

/**
 * Escalação confirmada (T26 da simulador; SIM-67), de `M:1792843200000_linha-de-base.sql:216-228`. Gravável pelo
 * `INSERT … ON CONFLICT (grupo_id, data) DO UPDATE` (SIM-69): `grupo_id` e `data` nunca mudam. `k` nulo = ilimitado em
 * 2 times e sempre nulo em 3+. `composicao` é `jsonb`: lida como `unknown` (a forma é conferida por `lerComposicao` do
 * contrato, SIM-94) e escrita como o texto do JSON.
 *
 * O tipo `escalacao_confirmada` de `eventos_uso` não entra aqui: `eventos_uso` é tipada pela T80 da partidas-e-ranking
 * (só inserção); até lá o INSERT do evento usa o `sql` do Kysely.
 */
export interface TabelaEscalacoes {
  id: Generated<string>;
  grupo_id: ColumnType<string, string, never>;
  data: ColumnType<string, string, never>;
  formato: 'dois_times' | 'varios_times';
  n: number;
  k: number | null;
  composicao: ColumnType<unknown, string, string>;
  confirmada_por: string;
  confirmada_em: Instante;
}

/** Tabelas tipadas do Kysely da requisição. As outras continuam pelo `sql` do Kysely. */
export interface Banco {
  grupos: TabelaGrupos;
  jogadores: TabelaJogadores;
  periodos_ativos: TabelaPeriodosAtivos;
  habilidades: TabelaHabilidades;
  notas: TabelaNotas;
  partidas: TabelaPartidas;
  presencas: TabelaPresencas;
  pagamentos_mes: TabelaPagamentosMes;
  config_financeira: TabelaConfigFinanceira;
  lancamentos: TabelaLancamentos;
  escalacoes: TabelaEscalacoes;
  config_pesos: TabelaConfigPesos;
  eventos_uso: TabelaEventosUso;
}

type Colunas<T> = { readonly [K in keyof T]-?: string };

/** Cada coluna tipada com o `udt_name` do catálogo (`information_schema.columns`), para o teste (GEL-112). */
export const COLUNAS_TIPADAS = {
  grupos: {
    id: 'uuid',
    nome: 'text',
    slug: 'text',
    dia_semana: 'text',
    frequencia: 'text',
    horario: 'time',
    situacao_comercial: 'text',
    trial_inicio: 'date',
    arquivado_em: 'timestamptz',
    criado_por: 'uuid',
    criado_em: 'timestamptz',
  },
  jogadores: {
    id: 'uuid',
    grupo_id: 'uuid',
    apelido: 'text',
    ano_nascimento: 'int2',
    posicao: 'text',
    telefone: 'text',
    pontuacao_inicial: 'int4',
    inicio_pontuacao: 'date',
    criado_por: 'uuid',
    criado_em: 'timestamptz',
    alterado_por: 'uuid',
    alterado_em: 'timestamptz',
  },
  periodos_ativos: { id: 'uuid', jogador_id: 'uuid', grupo_id: 'uuid', inicio: 'date', fim: 'date' },
  habilidades: { id: 'uuid', grupo_id: 'uuid', nome: 'text', ordem: 'int8' },
  notas: { jogador_id: 'uuid', habilidade_id: 'uuid', grupo_id: 'uuid', valor: 'int2' },
  partidas: {
    id: 'uuid',
    grupo_id: 'uuid',
    data: 'date',
    choveu: 'bool',
    criada_por: 'uuid',
    criada_em: 'timestamptz',
    alterada_por: 'uuid',
    alterada_em: 'timestamptz',
  },
  presencas: { partida_id: 'uuid', jogador_id: 'uuid', grupo_id: 'uuid', situacao: 'text' },
  config_pesos: {
    id: 'uuid',
    grupo_id: 'uuid',
    vigente_desde: 'date',
    presenca_sem_chuva: 'int2',
    presenca_com_chuva: 'int2',
    lesionado_sem_chuva: 'int2',
    lesionado_com_chuva: 'int2',
    expulso: 'int2',
    expulso_com_chuva: 'int2',
    registrado_por: 'uuid',
    registrado_em: 'timestamptz',
  },
  eventos_uso: {
    id: 'int8',
    grupo_id: 'uuid',
    tipo: 'text',
    momento: 'timestamptz',
    dispositivo_id: 'uuid',
    mes_exportado: 'text',
    data_partida: 'date',
  },
  pagamentos_mes: {
    grupo_id: 'uuid',
    jogador_id: 'uuid',
    mes: 'text',
    lancamento_id: 'uuid',
    marcado_por: 'uuid',
    marcado_em: 'timestamptz',
  },
  config_financeira: {
    grupo_id: 'uuid',
    mensalidade_centavos: 'int4',
    saldo_inicial_centavos: 'int4',
    data_saldo_inicial: 'date',
  },
  lancamentos: {
    id: 'uuid',
    grupo_id: 'uuid',
    tipo: 'text',
    data: 'date',
    descricao: 'text',
    valor_centavos: 'int4',
    criado_por: 'uuid',
    criado_em: 'timestamptz',
    alterado_por: 'uuid',
    alterado_em: 'timestamptz',
  },
  escalacoes: {
    id: 'uuid',
    grupo_id: 'uuid',
    data: 'date',
    formato: 'text',
    n: 'int2',
    k: 'int2',
    composicao: 'jsonb',
    confirmada_por: 'uuid',
    confirmada_em: 'timestamptz',
  },
} as const satisfies { readonly [T in keyof Banco]: Colunas<Banco[T]> };

/** Colunas que o tipo declara anuláveis (`| null` na leitura); o teste confere `is_nullable`. */
export const COLUNAS_ANULAVEIS: Readonly<Partial<Record<keyof Banco, readonly string[]>>> = {
  grupos: ['trial_inicio', 'arquivado_em'],
  jogadores: ['ano_nascimento', 'posicao', 'telefone', 'inicio_pontuacao'],
  periodos_ativos: ['fim'],
  pagamentos_mes: ['lancamento_id'],
  config_financeira: ['mensalidade_centavos'],
  escalacoes: ['k'],
  eventos_uso: ['dispositivo_id', 'mes_exportado', 'data_partida'],
};
