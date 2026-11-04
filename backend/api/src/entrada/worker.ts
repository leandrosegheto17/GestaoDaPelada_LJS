import { withSentry } from '@sentry/cloudflare';
import { criarApp } from './app.ts';
import type { Env } from './env.ts';
import { configurarSentry } from './observabilidade.ts';

const app = criarApp();

export default withSentry(configurarSentry, {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>);
