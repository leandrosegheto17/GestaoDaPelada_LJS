import { defineConfig } from 'vitest/config';

/**
 * Arquivos de teste em série: os orçamentos de CPU (SIM-57, SIM-58, PAR-63) medem milissegundos e reprovam
 * quando outros arquivos disputam a CPU no mesmo processo (668 testes passam em série; 3 falham em paralelo).
 * Os limiares continuam os mesmos.
 */
export default defineConfig({
  test: { fileParallelism: false },
});
