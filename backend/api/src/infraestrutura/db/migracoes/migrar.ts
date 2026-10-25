import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { lerEsquema } from './esquema.ts';
import { aplicarMigracoes, PASTA_MIGRACOES } from './executar.ts';

/** Nomes que o runner antigo do legado grava em `migracoes_aplicadas` (as 13 migrations do legado). */
export const MIGRACOES_LEGADO = [
  '202610161700_acesso.sql',
  '202610161701_grupos.sql',
  '202610161710_elenco.sql',
  '202610161711_habilidades.sql',
  '202610161712_partidas.sql',
  '202610161713_uso.sql',
  '202610161720_habilidades_ordem.sql',
  '202610161730_escalacoes.sql',
  '202610161740_financeiro.sql',
  '202610171000_comentarios_lgpd.sql',
  '202610200000_adequacao_legado.sql',
  '202610201000_inicio_pontuacao.sql',
  '202610210000_contrai_posicao.sql',
] as const;

/**
 * Schema esperado logo depois da linha de base (saída de `lerEsquema`, uma linha por item).
 * Gerado a partir de um banco vazio com só a linha de base; o teste da fixture B confere que continua igual.
 */
export const ARQUIVO_ESQUEMA_LINHA_DE_BASE = join(PASTA_MIGRACOES, 'linha-de-base.esquema.txt');

export type Estado = 'vazio' | 'legado' | 'gerenciado' | 'parcial';

export interface Deteccao {
  estado: Estado;
  /** Só no estado `parcial`: o que difere do schema e do registro do legado. */
  diferencas: string[];
}

export function esquemaDaLinhaDeBase(): string[] {
  return readFileSync(ARQUIVO_ESQUEMA_LINHA_DE_BASE, 'utf8')
    .split('\n')
    .filter((linha) => linha !== '');
}

function hash(linhas: readonly string[]): string {
  return createHash('sha256').update(linhas.join('\n')).digest('hex');
}

/** Hash do schema da aplicação (tabelas, colunas, tipos, restrições, índices e triggers), sem dados. */
export async function impressaoDigital(cliente: pg.ClientBase): Promise<string> {
  return hash(await lerEsquema(cliente));
}

async function existeTabela(cliente: pg.ClientBase, nome: string): Promise<boolean> {
  const { rows } = await cliente.query<{ existe: boolean }>('SELECT to_regclass($1) IS NOT NULL AS existe', [
    `public.${nome}`,
  ]);
  return rows[0]?.existe === true;
}

function diferencasEntre(rotulo: string, esperado: readonly string[], atual: readonly string[]): string[] {
  const noAtual = new Set(atual);
  const noEsperado = new Set(esperado);
  return [
    ...esperado.filter((item) => !noAtual.has(item)).map((item) => `${rotulo} faltando: ${item}`),
    ...atual.filter((item) => !noEsperado.has(item)).map((item) => `${rotulo} a mais: ${item}`),
  ];
}

/**
 * Classifica o banco antes de migrar (FUN-08 a FUN-10):
 * - `gerenciado`: `pgmigrations` existe;
 * - `vazio`: nenhuma tabela da aplicação;
 * - `legado`: `migracoes_aplicadas` com exatamente os 13 nomes do legado e o schema igual ao da linha de base;
 * - `parcial`: qualquer outro estado, com a lista de diferenças.
 */
export async function detectarEstado(cliente: pg.ClientBase): Promise<Deteccao> {
  if (await existeTabela(cliente, 'pgmigrations')) return { estado: 'gerenciado', diferencas: [] };

  const esquema = await lerEsquema(cliente);
  if (!esquema.some((linha) => linha.startsWith('tabela '))) return { estado: 'vazio', diferencas: [] };

  const registradas = (await existeTabela(cliente, 'migracoes_aplicadas'))
    ? (await cliente.query<{ nome: string }>('SELECT nome FROM migracoes_aplicadas ORDER BY nome')).rows.map(
        (r) => r.nome,
      )
    : [];
  const esperado = esquemaDaLinhaDeBase();
  const diferencas = [
    ...diferencasEntre('migracoes_aplicadas', MIGRACOES_LEGADO, registradas),
    ...(hash(esquema) === hash(esperado) ? [] : diferencasEntre('schema', esperado, esquema)),
  ];
  return diferencas.length === 0 ? { estado: 'legado', diferencas } : { estado: 'parcial', diferencas };
}

export class EstadoParcial extends Error {
  readonly diferencas: string[];

  constructor(diferencas: string[]) {
    super(
      [
        'O banco não está vazio nem igual ao legado: nada foi alterado. Diferenças:',
        ...diferencas.map((d) => `  - ${d}`),
      ].join('\n'),
    );
    this.diferencas = diferencas;
  }
}

export interface ResultadoMigrar {
  estado: Exclude<Estado, 'parcial'>;
  /** Registradas como aplicadas sem executar o SQL (a linha de base no estado `legado`). */
  registradas: string[];
  /** Executadas de fato. */
  aplicadas: string[];
}

/**
 * Detecta o estado e migra. No `legado`, registra a linha de base com `fake` (sem DDL e sem tocar nos dados)
 * e aplica só as migrations novas. No `parcial`, aborta antes de qualquer escrita.
 */
export async function migrar(url: string): Promise<ResultadoMigrar> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  let deteccao: Deteccao;
  try {
    deteccao = await detectarEstado(cliente);
  } finally {
    await cliente.end();
  }
  if (deteccao.estado === 'parcial') throw new EstadoParcial(deteccao.diferencas);

  const registradas = deteccao.estado === 'legado' ? await aplicarMigracoes({ url, quantas: 1, fake: true }) : [];
  const aplicadas = await aplicarMigracoes({ url });
  return { estado: deteccao.estado, registradas, aplicadas };
}
