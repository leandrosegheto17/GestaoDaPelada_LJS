import { join } from 'node:path';

/** Pasta das migrações copiadas (T16). */
export const PASTA = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'infraestrutura',
  'db',
  'migracoes',
);
