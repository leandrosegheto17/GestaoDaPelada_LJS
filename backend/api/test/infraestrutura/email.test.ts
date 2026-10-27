// Critérios: ACE-52 (falha do Resend vira 'falhou'), ACE-21 (o log não traz corpo nem link), G-18 (link de URL_PUBLICA).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { remetenteMemoria } from '../../src/infraestrutura/email/memoria.ts';
import {
  modeloCadastroDuplicado,
  modeloConfirmacao,
  modeloConvite,
  modeloRecuperacao,
} from '../../src/infraestrutura/email/modelos.ts';
import type { Mensagem } from '../../src/infraestrutura/email/remetente.ts';
import { remetenteResend } from '../../src/infraestrutura/email/resend.ts';

const CONFIG = { RESEND_API_KEY: 're_chave_secreta', RESEND_REMETENTE: 'Pelada <nao-responda@exemplo.test>' };
const TOKEN = 'T'.repeat(43);
const LINK = `https://app.exemplo.test/confirmar#t=${TOKEN}`;
const mensagem: Mensagem = {
  para: 'ana@ex.com',
  assunto: 'Confirme seu e-mail',
  texto: `Abra ${LINK}`,
  html: `<a href="${LINK}">abrir</a>`,
  chave: 'confirmacao-abc',
};

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

function espiarLogs() {
  const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((n) =>
    vi.spyOn(console, n).mockImplementation(() => {}),
  );
  return () =>
    espioes
      .flatMap((e) => e.mock.calls)
      .map((chamada) => chamada.join(' '))
      .join('\n');
}

afterEach(() => vi.restoreAllMocks());

describe('remetenteResend', () => {
  it('200 vira enviado e a requisição leva chave, texto e html', async () => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(resposta(200, { id: 'x' }));
    expect(await remetenteResend(CONFIG, buscar).enviar(mensagem)).toBe('enviado');
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    const cab = init?.headers as Record<string, string>;
    expect(cab['Idempotency-Key']).toBe('confirmacao-abc');
    expect(cab['Authorization']).toBe('Bearer re_chave_secreta');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: CONFIG.RESEND_REMETENTE,
      to: ['ana@ex.com'],
      subject: mensagem.assunto,
      text: mensagem.texto,
      html: mensagem.html,
    });
  });

  it('429 daily_quota_exceeded vira falhou e o log só traz o status e o código', async () => {
    const logs = espiarLogs();
    const buscar = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        resposta(429, { name: 'daily_quota_exceeded', message: `cota esgotada para ${LINK}`, statusCode: 429 }),
      );
    expect(await remetenteResend(CONFIG, buscar).enviar(mensagem)).toBe('falhou');
    const saida = logs();
    expect(saida).toContain('429');
    expect(saida).toContain('daily_quota_exceeded');
    expect(saida).not.toContain('cota esgotada');
    expect(saida).not.toContain(TOKEN);
    expect(saida).not.toContain('/confirmar');
    expect(saida).not.toContain('re_chave_secreta');
    expect(saida).not.toContain('ana@ex.com');
  });

  it('500 vira falhou e o log não traz o corpo nem o link', async () => {
    const logs = espiarLogs();
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(new Response(`erro interno ${LINK}`, { status: 500 }));
    expect(await remetenteResend(CONFIG, buscar).enviar(mensagem)).toBe('falhou');
    const saida = logs();
    expect(saida).toContain('500');
    expect(saida).not.toContain('erro interno');
    expect(saida).not.toContain(TOKEN);
  });

  it('falha de rede vira falhou sem expor o link', async () => {
    const logs = espiarLogs();
    const buscar = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`falhou ${LINK}`));
    expect(await remetenteResend(CONFIG, buscar).enviar(mensagem)).toBe('falhou');
    expect(logs()).not.toContain(TOKEN);
  });
});

describe('remetenteMemoria', () => {
  it('guarda as mensagens enviadas e devolve enviado', async () => {
    const r = remetenteMemoria();
    expect(await r.enviar(mensagem)).toBe('enviado');
    expect(r.mensagens).toEqual([mensagem]);
  });
});

describe('modelos', () => {
  const urlPublica = 'https://app.exemplo.test';

  it('a confirmação leva o link ${URL_PUBLICA}/confirmar#t=<token> no texto e no html', () => {
    const m = modeloConfirmacao({ urlPublica, nome: 'Ana', token: TOKEN });
    expect(m.texto).toContain(`${urlPublica}/confirmar#t=${TOKEN}`);
    expect(m.html).toContain(`href="${urlPublica}/confirmar#t=${TOKEN}"`);
  });
  it('a barra final de URL_PUBLICA não duplica a barra do caminho', () => {
    const m = modeloConfirmacao({ urlPublica: `${urlPublica}/`, nome: 'Ana', token: TOKEN });
    expect(m.texto).toContain(`${urlPublica}/confirmar#t=${TOKEN}`);
  });
  it('a recuperação aponta para a tela de nova senha', () => {
    expect(modeloRecuperacao({ urlPublica, nome: 'Ana', token: TOKEN }).texto).toContain(
      `${urlPublica}/entrar/nova-senha#t=${TOKEN}`,
    );
  });
  it('o convite cita o grupo e aponta para /convite', () => {
    const m = modeloConvite({ urlPublica, grupoNome: 'Pelada <dos> Amigos', token: TOKEN });
    expect(m.texto).toContain(`${urlPublica}/convite#t=${TOKEN}`);
    expect(m.assunto).toContain('Pelada <dos> Amigos');
    expect(m.html).toContain('Pelada &lt;dos&gt; Amigos');
    expect(m.html).not.toContain('<dos>');
  });
  it('o aviso de cadastro duplicado não leva token', () => {
    const m = modeloCadastroDuplicado({ urlPublica, nome: 'Ana' });
    expect(m.texto).toContain(`${urlPublica}/entrar`);
    expect(m.texto).not.toContain('#t=');
  });
});
