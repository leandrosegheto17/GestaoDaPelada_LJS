import { Hono } from 'hono';
import { ehRemetenteMemoria } from '../../infraestrutura/email/memoria.ts';
import type { AppEnv } from '../app.ts';
import { naoEncontrado } from '../erros.ts';

/**
 * `GET /api/dev/emails`: as mensagens da caixa em memória, para o desenvolvimento e os testes ponta a ponta lerem os
 * links. Só existe com `EMAIL_DEV=1` (e o remetente em memória); fora disso, 404 como qualquer rota desconhecida.
 */
export const rotaDevEmails = new Hono<AppEnv>().get('/api/dev/emails', (c) => {
  const remetente = c.var.remetente;
  if (c.env.EMAIL_DEV !== '1' || !ehRemetenteMemoria(remetente)) return naoEncontrado(c);
  return c.json({ mensagens: remetente.mensagens });
});
