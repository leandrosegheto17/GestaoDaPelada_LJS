import type { Env as EnvDoWorker } from '../src/entrada/env.ts';

declare global {
  namespace Cloudflare {
    // O ambiente de teste tem os mesmos bindings e variáveis do Worker, mais o banco como owner (só para conferir).
    interface Env extends EnvDoWorker {
      HYPERDRIVE_OWNER_TESTE: Hyperdrive;
    }
  }
}
