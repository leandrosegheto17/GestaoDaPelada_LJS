import type { Env as EnvDoWorker } from '../src/entrada/env.ts';

declare global {
  namespace Cloudflare {
    // Tipa `exports.default` do `cloudflare:workers` com o Worker real.
    interface GlobalProps {
      mainModule: typeof import('../src/entrada/worker.ts');
    }

    // O ambiente de teste tem os bindings do Worker mais o HTML que o build serve em `/`.
    interface Env extends EnvDoWorker {
      INDEX_HTML_ESPERADO: string;
      ASSETS: Fetcher;
    }
  }
}
