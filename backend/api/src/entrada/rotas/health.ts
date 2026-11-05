import { Hono } from 'hono';
import type { Ambiente } from '../ambiente.ts';

/** `GET /api/health` (FUN-21): responde sem tocar o banco, com o SHA publicado. */
export const health = new Hono<Ambiente>().get('/health', (c) =>
  c.json({ status: 'ok', versao: c.env.VERSAO }),
);
