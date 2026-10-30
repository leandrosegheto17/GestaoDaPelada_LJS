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

  describe('tempo máximo de 10 s (ACE-75; SEC-CA-13, T68)', () => {
    afterEach(() => vi.useRealTimers());

    /** Provedor que não responde: só termina quando o pedido é abortado. */
    const semResposta = () =>
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolver, rejeitar) => {
            init?.signal?.addEventListener('abort', () =>
              rejeitar(new DOMException('O pedido foi abortado.', 'AbortError')),
            );
          }),
      );

    it('provedor que não responde: aborta aos 10 s e vira falhou', async () => {
      vi.useFakeTimers();
      const logs = espiarLogs();
      const buscar = semResposta();
      let resultado: string | undefined;
      const envio = remetenteResend(CONFIG, buscar)
        .enviar(mensagem)
        .then((r) => (resultado = r));

      await vi.advanceTimersByTimeAsync(9_999);
      expect(resultado).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await envio;
      expect(resultado).toBe('falhou');
      expect(buscar.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(logs()).toContain('email:');
      expect(logs()).not.toContain(TOKEN);
    });

    it('resposta dentro do prazo: enviado, e o relógio não fica armado', async () => {
      vi.useFakeTimers();
      const buscar = vi.fn<typeof fetch>().mockResolvedValue(resposta(200, { id: 'x' }));
      expect(await remetenteResend(CONFIG, buscar).enviar(mensagem)).toBe('enviado');
      expect(vi.getTimerCount()).toBe(0);
    });
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

  describe('nome do grupo no convite como texto puro (T78; SEC-006)', () => {
    const convite = (grupoNome: string) => modeloConvite({ urlPublica, grupoNome, token: TOKEN });
    /** Assunto, texto e html: o que o cliente de e-mail mostra. */
    const partes = (m: { assunto: string; texto: string; html: string }) => [m.assunto, m.texto, m.html];
    /** Algum dos caracteres aparece no texto (sem regex de controle, que o lint recusa). */
    const contemAlgum = (texto: string, caracteres: string) => [...caracteres].some((c) => texto.includes(c));

    it('nome normal sai igual ao de hoje', () => {
      expect(convite('Pelada de Quinta')).toEqual({
        assunto: 'Convite para administrar Pelada de Quinta',
        texto:
          'Você foi convidado para administrar o grupo Pelada de Quinta no Gestão da Pelada.\n\n' +
          `O convite vale por 7 dias.\n\nAceitar convite: ${urlPublica}/convite#t=${TOKEN}\n`,
        html:
          '<p>Você foi convidado para administrar o grupo Pelada de Quinta no Gestão da Pelada.</p>' +
          `<p>O convite vale por 7 dias.</p><p><a href="${urlPublica}/convite#t=${TOKEN}">Aceitar convite</a></p>`,
      });
      expect(convite('Pelada F.C. do Zé').assunto).toBe('Convite para administrar Pelada F.C. do Zé');
    });

    it.each([
      ['URL com esquema', 'Confirme seu Pix em https://golpe.com', ['https://golpe', 'golpe.com', '://golpe']],
      ['www', 'Pix: www.golpe.com.br', ['www.', 'golpe.com']],
      ['domínio solto', 'Acesse golpe.net agora', ['golpe.net']],
      ['e-mail', 'Mande para pix@golpe.io', ['pix@golpe', 'golpe.io']],
    ])('%s não vira link no assunto, no texto nem no html', (_caso, nome, proibidos) => {
      const m = convite(nome);
      for (const parte of partes(m)) {
        for (const p of proibidos) expect(parte).not.toContain(p);
      }
      // O único link do e-mail é o do convite.
      expect(m.texto.match(/:\/\//g)).toHaveLength(1);
      expect(m.html.match(/<a /g)).toHaveLength(1);
      expect(m.html.match(/href=/g)).toHaveLength(1);
    });

    it('quebra de linha e controle no nome não injetam linha no assunto, no texto nem no html', () => {
      const normal = convite('Pelada de Quinta');
      const m = convite('Pelada\r\nBcc: alguem\nX-Outro: 1\u0000\u2028fim');
      expect(contemAlgum(m.assunto, '\r\n\u0000\u2028')).toBe(false);
      expect(m.texto.split('\n')).toHaveLength(normal.texto.split('\n').length);
      expect(contemAlgum(m.texto, '\r\u0000\u2028')).toBe(false);
      expect(contemAlgum(m.html, '\r\n\u0000\u2028')).toBe(false);
      expect(m.assunto).toBe('Convite para administrar Pelada Bcc: alguem X-Outro: 1 fim');
    });

    it('HTML no nome continua escapado e não vira link', () => {
      const m = convite('<a href="https://golpe.com">Pix</a>');
      expect(m.html).not.toContain('<a href="https://golpe');
      expect(m.html).not.toContain('golpe.com');
      expect(m.html.match(/<a /g)).toHaveLength(1);
    });

    it('nome longo é cortado em 60 caracteres, com reticências', () => {
      const m = convite('a'.repeat(200));
      expect(m.assunto).toBe(`Convite para administrar ${'a'.repeat(59)}…`);
      expect(m.texto).not.toContain('a'.repeat(60));
      expect(m.html).not.toContain('a'.repeat(60));
      expect(convite('b'.repeat(60)).assunto).toBe(`Convite para administrar ${'b'.repeat(60)}`);
    });
  });
});
