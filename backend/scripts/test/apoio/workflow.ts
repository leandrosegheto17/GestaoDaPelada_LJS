import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const RAIZ = join(import.meta.dirname, '..', '..', '..', '..');

export interface Passo {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  if?: string;
  'continue-on-error'?: unknown;
  strategy?: { matrix?: Record<string, unknown> };
}

export interface Job {
  'runs-on'?: string;
  environment?: string | { name: string };
  needs?: string | string[];
  if?: string;
  services?: Record<string, { image?: string }>;
  steps?: Passo[];
  'continue-on-error'?: unknown;
  strategy?: { matrix?: Record<string, unknown> };
}

export interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}

export function textoDo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), 'utf8');
}

export function lerWorkflow(nome: string): Workflow {
  return parse(textoDo(`.github/workflows/${nome}`)) as Workflow;
}

export function passos(wf: Workflow): Passo[] {
  return Object.values(wf.jobs).flatMap((j) => j.steps ?? []);
}

/** Todo `uses:` de terceiros, fora as ações locais (`./...`). */
export function usesExternos(texto: string): string[] {
  return [...texto.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)]
    .map((m) => m[1] ?? '')
    .filter((u) => !u.startsWith('./'));
}

export const SHA_40 = /@[0-9a-f]{40}$/;
