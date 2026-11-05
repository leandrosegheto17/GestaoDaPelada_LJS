import { Hono } from 'hono';
import type { Ambiente } from '../ambiente.ts';
import { caixaDev, emailDevLigado } from '../../infraestrutura/email/caixa-dev.ts';

/**
 * `GET /api/dev/emails` (T17): lista as mensagens da caixa de desenvolvimento, para o e2e e o
 * `pnpm dev` lerem os links. Só existe com `EMAIL_DEV=1`; sem ela, responde o mesmo 404 de
 * qualquer rota que não existe (o Hono monta o app uma vez, sem o `env`, então a "rota só
 * registrada com a variável" é esta checagem no começo).
 */
export const devEmails = new Hono<Ambiente>();

devEmails.get('/dev/emails', (c) => {
  if (!emailDevLigado(c.env)) return c.json({ erro: 'Rota não encontrada.' }, 404);
  return c.json({
    mensagens: caixaDev.mensagens.map((m) => ({
      tipo: m.tipo,
      para: m.para,
      assunto: m.assunto,
      texto: m.texto,
      html: m.html,
    })),
  });
});
