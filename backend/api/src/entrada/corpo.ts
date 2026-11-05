import type { Context } from 'hono';
import type { z } from 'zod';
import { corpoDoErro, erroDeValidacao, MENSAGEM_CORRIJA_CAMPOS, type CorpoErro } from '@pelada/contrato';
import type { Ambiente } from './ambiente.ts';

/**
 * Leitura do corpo e erros de entrada (T20; GEL-118), extraídos das rotas de acesso (`apoio-acesso.ts`, que agora
 * reexporta o `lerCorpo` daqui).
 *
 * - `lerCorpo`: o das rotas de acesso, sem mudança (422 `termos_obrigatorios` ou `dados_invalidos` com os nomes dos
 *   campos, ACE-02, ACE-03).
 * - `lerCorpoDoGrupo`: o das rotas de grupo (GS:70): 422 `dados_invalidos` com "Corrija os campos indicados.", os
 *   nomes em `campos` e a mensagem de cada campo em `mensagens` (a primeira do campo). Nada é gravado: a rota sai antes
 *   do repositório e o `comBanco` desfaz no 4xx.
 * - `erroDeUnicidade`: o 23505 dos índices únicos de apelido e de habilidade vira o mesmo 422 do campo (a corrida que
 *   passou pela consulta antes de gravar, `GD:155`); outra constraint, ou outro erro, não é traduzido e sobe como 500.
 *
 * SPEC_DEVIATION: o mockup e `GS:70` põem a mensagem de cada campo dentro de `campos`; aqui ela vai em `mensagens`, e
 * `campos` continua a lista de nomes da conta e acesso, para as rotas e o front de acesso seguirem iguais.
 */

export type Leitura<T> = { ok: true; dados: T } | { ok: false; resposta: Response };

async function lerJson(c: Context<Ambiente>): Promise<{ ok: true; bruto: unknown } | { ok: false }> {
  try {
    return { ok: true, bruto: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

/** Corpo JSON pelo schema do contrato, no formato das rotas de acesso (ACE-02, ACE-03). */
export async function lerCorpo<S extends z.ZodType>(c: Context<Ambiente>, schema: S): Promise<Leitura<z.infer<S>>> {
  const json = await lerJson(c);
  if (!json.ok) return { ok: false, resposta: c.json(corpoDoErro('dados_invalidos'), 422) };
  const r = schema.safeParse(json.bruto);
  if (!r.success) return { ok: false, resposta: c.json(erroDeValidacao(r.error), 422) };
  return { ok: true, dados: r.data };
}

/** Corpo 422 das rotas de grupo, com a mensagem de cada campo (GEL-118). */
export function erroDeCampos(mensagens: Readonly<Record<string, string>>): CorpoErro {
  const campos = Object.keys(mensagens).sort();
  const ordenadas: Record<string, string> = {};
  for (const campo of campos) ordenadas[campo] = mensagens[campo]!;
  return { erro: MENSAGEM_CORRIJA_CAMPOS, codigo: 'dados_invalidos', campos, mensagens: ordenadas };
}

/** A primeira mensagem de cada campo da falha do zod. Problema sem campo (ex.: `refine` do objeto) vai em `corpo`. */
export function mensagensDoZod(erro: z.ZodError): Record<string, string> {
  const mensagens: Record<string, string> = {};
  for (const problema of erro.issues) {
    const campo = problema.path.length > 0 ? String(problema.path[0]) : 'corpo';
    mensagens[campo] ??= problema.message;
  }
  return mensagens;
}

/** Resposta 422 de um campo só, para as regras do repositório e do domínio (apelido repetido, período). */
export function respostaDeCampo(c: Context<Ambiente>, campo: string, mensagem: string): Response {
  return c.json(erroDeCampos({ [campo]: mensagem }), 422);
}

/**
 * Corpo JSON pelo schema do contrato, no formato das rotas de grupo (GS:70, GEL-118). JSON inválido: 422 com a
 * mensagem geral e o campo `corpo`.
 *
 * `preparar` muda o JSON antes do schema (grupos-e-elenco T37: o PATCH do jogador ignora a `dataEntrada`, GEL-41, e o
 * corpo do contrato é `.strict()`).
 */
export async function lerCorpoDoGrupo<S extends z.ZodType>(
  c: Context<Ambiente>,
  schema: S,
  preparar: (bruto: unknown) => unknown = (bruto) => bruto,
): Promise<Leitura<z.infer<S>>> {
  const json = await lerJson(c);
  if (!json.ok) return { ok: false, resposta: c.json(erroDeCampos({ corpo: 'Envie um JSON válido.' }), 422) };
  const r = schema.safeParse(preparar(json.bruto));
  if (!r.success) return { ok: false, resposta: c.json(erroDeCampos(mensagensDoZod(r.error)), 422) };
  return { ok: true, dados: r.data };
}

export const MENSAGEM_APELIDO_REPETIDO = 'Já existe um jogador com esse apelido neste grupo.';
export const MENSAGEM_HABILIDADE_REPETIDA = 'Já existe uma habilidade com esse nome.';

/** Índices únicos traduzidos para o 422 do campo (GEL-35, GEL-91), pelo nome da constraint. */
const UNICIDADE: Readonly<Record<string, { campo: string; mensagem: string }>> = {
  jogadores_apelido_grupo: { campo: 'apelido', mensagem: MENSAGEM_APELIDO_REPETIDO },
  habilidades_nome_grupo: { campo: 'nome', mensagem: MENSAGEM_HABILIDADE_REPETIDA },
};

/**
 * O campo e a mensagem do 23505 de um índice conhecido, ou nulo para qualquer outro erro (que a rota deve relançar,
 * virando 500 no `onError`).
 */
export function erroDeUnicidade(erro: unknown): { campo: string; mensagem: string } | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const { code, constraint } = erro as { code?: unknown; constraint?: unknown };
  if (code !== '23505' || typeof constraint !== 'string') return null;
  return UNICIDADE[constraint] ?? null;
}

/**
 * Roda a escrita e traduz o 23505 de apelido ou habilidade no 422 do campo; o resto sobe. O `comBanco` desfaz a
 * transação no 422 (status 4xx).
 */
export async function comUnicidade(c: Context<Ambiente>, escrever: () => Promise<Response>): Promise<Response> {
  try {
    return await escrever();
  } catch (erro) {
    const traduzido = erroDeUnicidade(erro);
    if (!traduzido) throw erro;
    return respostaDeCampo(c, traduzido.campo, traduzido.mensagem);
  }
}
