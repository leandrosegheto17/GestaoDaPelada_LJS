import type { Env as EnvDoWorker } from '../src/entrada/env.ts';

declare global {
  namespace Cloudflare {
    // O ambiente de teste tem os mesmos bindings e variáveis do Worker.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends EnvDoWorker {}
  }
}
