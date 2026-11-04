import { Hono } from 'hono';
import type { AppEnv } from '../app.ts';

/** Saúde: responde sem tocar o banco (FUN-21). */
export const health = new Hono<AppEnv>().get('/health', (c) =>
  c.json({ status: 'ok', versao: c.env.VERSAO }),
);
