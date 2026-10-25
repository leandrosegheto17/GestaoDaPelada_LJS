import type { Env } from './env.ts';

// Entrada do Worker. As rotas /api/* chegam aqui por `run_worker_first`; o resto é servido pelos assets.
export default {
  fetch: () => new Response(null, { status: 404 }),
} satisfies ExportedHandler<Env>;
