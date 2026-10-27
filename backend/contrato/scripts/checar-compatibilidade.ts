// G-20: o contrato não quebra clientes em silêncio. Gera a forma de cada schema exportado, compara com o
// snapshot gravado (`compatibilidade.json`) e falha quando um campo some, muda de tipo ou fica obrigatório
// sem uma linha em `QUEBRAS.md` (formato: "- `schema.campo`"). Uso:
//   node scripts/checar-compatibilidade.ts [--gravar] [--snapshot <arquivo>] [--quebras <arquivo>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as contrato from '../src/index.ts';

export interface Campo {
  tipo: string;
  obrigatorio: boolean;
}
/** Para cada schema exportado, o caminho de cada campo (`grupos[].id`) e a sua forma. */
export type Forma = Record<string, Record<string, Campo>>;

type Json = { type?: unknown; properties?: Record<string, Json>; required?: string[]; items?: Json; anyOf?: Json[] };

function achatar(js: Json, caminho: string, obrigatorio: boolean, saida: Record<string, Campo>): void {
  const tipo = Array.isArray(js.type) ? js.type.join('|') : typeof js.type === 'string' ? js.type : 'outro';
  saida[caminho] = { tipo, obrigatorio };
  for (const [nome, filho] of Object.entries(js.properties ?? {})) {
    achatar(filho, caminho ? `${caminho}.${nome}` : nome, (js.required ?? []).includes(nome), saida);
  }
  if (js.items) achatar(js.items, `${caminho}[]`, true, saida);
}

/** A forma JSON de cada schema zod exportado pelo módulo. */
export function formaDe(modulo: Record<string, unknown>): Forma {
  const forma: Forma = {};
  for (const [nome, valor] of Object.entries(modulo).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(valor instanceof z.ZodType)) continue;
    const campos: Record<string, Campo> = {};
    achatar(z.toJSONSchema(valor, { io: 'input', unrepresentable: 'any' }) as Json, '', true, campos);
    forma[nome] = campos;
  }
  return forma;
}

const chave = (schema: string, caminho: string) => (caminho ? `${schema}.${caminho}` : schema);

/** Quebras não autorizadas: cada texto é a chave que `QUEBRAS.md` precisaria listar. */
export function comparar(anterior: Forma, atual: Forma, autorizadas: ReadonlySet<string>): string[] {
  const problemas: string[] = [];
  const quebra = (k: string, motivo: string) => {
    if (!autorizadas.has(k)) problemas.push(`${k}: ${motivo}`);
  };
  for (const [schema, campos] of Object.entries(anterior)) {
    const novos = atual[schema];
    if (!novos) {
      quebra(schema, 'schema removido');
      continue;
    }
    for (const [caminho, velho] of Object.entries(campos)) {
      const novo = novos[caminho];
      if (!novo) quebra(chave(schema, caminho), 'campo removido ou renomeado');
      else if (novo.tipo !== velho.tipo)
        quebra(chave(schema, caminho), `tipo mudou de ${velho.tipo} para ${novo.tipo}`);
      else if (novo.obrigatorio && !velho.obrigatorio) quebra(chave(schema, caminho), 'passou a ser obrigatório');
    }
    for (const [caminho, novo] of Object.entries(novos)) {
      if (!campos[caminho] && novo.obrigatorio) quebra(chave(schema, caminho), 'campo novo e obrigatório');
    }
  }
  return problemas;
}

export function lerQuebras(texto: string): Set<string> {
  const chaves = new Set<string>();
  for (const linha of texto.split('\n')) {
    const achou = /^\s*[-*]\s+`?([\w.[\]]+)`?/.exec(linha);
    if (achou?.[1]) chaves.add(achou[1]);
  }
  return chaves;
}

function principal(args: string[]): number {
  const raiz = resolve(import.meta.dirname, '..');
  const valor = (flag: string, padrao: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? resolve(args[i + 1] as string) : padrao;
  };
  const arquivoSnapshot = valor('--snapshot', resolve(raiz, 'compatibilidade.json'));
  const arquivoQuebras = valor('--quebras', resolve(raiz, 'QUEBRAS.md'));
  const atual = formaDe(contrato);
  if (args.includes('--gravar')) {
    writeFileSync(arquivoSnapshot, `${JSON.stringify(atual, null, 2)}\n`);
    console.log(`Snapshot gravado em ${arquivoSnapshot}.`);
    return 0;
  }
  if (!existsSync(arquivoSnapshot)) {
    console.error(`Snapshot ausente: ${arquivoSnapshot}. Rode com --gravar.`);
    return 1;
  }
  const anterior = JSON.parse(readFileSync(arquivoSnapshot, 'utf8')) as Forma;
  const autorizadas = existsSync(arquivoQuebras) ? lerQuebras(readFileSync(arquivoQuebras, 'utf8')) : new Set<string>();
  const problemas = comparar(anterior, atual, autorizadas);
  if (problemas.length > 0) {
    console.error('Quebra de compatibilidade do contrato (liste em QUEBRAS.md ou reverta):');
    for (const p of problemas) console.error(`  - ${p}`);
    return 1;
  }
  console.log('Contrato compatível com o snapshot.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
