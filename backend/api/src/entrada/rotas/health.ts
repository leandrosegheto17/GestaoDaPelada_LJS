import { Hono } from 'hono';
import type { AppEnv } from '../app.ts';

/** `GET /api/health`: saúde do Worker, sem tocar o banco (FUN-20). `versao` é o SHA injetado no deploy. */
export const rotaHealth = new Hono<AppEnv>().get('/api/health', (c) => c.json({ status: 'ok', versao: c.env.VERSAO }));
