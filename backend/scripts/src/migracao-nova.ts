import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Timestamp da última das 23 migrações copiadas; toda migração nova vem depois. */
export const ULTIMA_MIGRACAO_COPIADA = 1792844520000;

const PASTA_REAL = join(
  import.meta.dirname,
  '..',
  '..',
  'api',
  'src',
  'infraestrutura',
  'db',
  'migracoes',
);

function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Cria o `.sql` da próxima migração, com timestamp maior que o de qualquer arquivo existente (FUN-07). */
export function gerarMigracao(op: { pasta: string; nome: string; agora?: number }): string {
  const nome = normalizar(op.nome);
  if (!nome) throw new Error('Informe um nome para a migração (letras e números).');

  const existentes = existsSync(op.pasta)
    ? readdirSync(op.pasta)
        .filter((n) => n.endsWith('.sql'))
        .map((n) => Number(n.split('_')[0]))
        .filter(Number.isFinite)
    : [];
  const piso = Math.max(ULTIMA_MIGRACAO_COPIADA, ...existentes);
  const timestamp = Math.max(op.agora ?? Date.now(), piso + 1);

  const arquivo = `${timestamp}_${nome}.sql`;
  writeFileSync(join(op.pasta, arquivo), '-- Up Migration\n\n', { flag: 'wx' });
  return arquivo;
}

if (import.meta.main) {
  try {
    const arquivo = gerarMigracao({ pasta: PASTA_REAL, nome: process.argv.slice(2).join(' ') });
    console.log(`Criada: backend/api/src/infraestrutura/db/migracoes/${arquivo}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
