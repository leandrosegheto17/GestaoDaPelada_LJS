import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Local: as URLs dos bancos de teste vêm do `.env` da raiz (fora do git). No CI, do ambiente do job.
const ENV = join(import.meta.dirname, '../../.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);

export default defineConfig({
  test: {
    // As roles são do servidor inteiro (não do banco): migrar dois bancos ao mesmo tempo disputaria o catálogo.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
