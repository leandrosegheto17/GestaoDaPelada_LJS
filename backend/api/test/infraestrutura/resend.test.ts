import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  remetenteMemoria,
  remetenteResend,
  TEMPO_LIMITE_MS,
  URL_RESEND,
  type Mensagem,
} from '../../src/infraestrutura/email/resend.ts';

/** Remetente do Resend e em memória (T15; ACE-21, ACE-52, ACE-75). */

const TOKEN = 'TokenSecretoDoLinkDeRecuperacao0123456789ab';
const MENSAGEM: Mensagem = {
  tipo: 'recuperacao',
  para: 'fulana@exemplo.com',
  assunto: 'Crie uma nova senha',
  texto: `Abra https://app.test/entrar/nova-senha#t=${TOKEN}`,
  html: `<a href="https://app.test/entrar/nova-senha#t=${TOKEN}">Criar senha</a>`,
  idempotencia: 'recuperacao-123',
};
const CONFIG = { RESEND_API_KEY: 're_chave_de_teste', RESEND_REMETENTE: 'Pelada <nao-responda@exemplo.com>' };

function resposta(status: number, corpo: unknown = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

function comLog() {
  const linhas: Array<Record<string, string | number>> = [];
  return { linhas, registrar: (l: Record<string, string | number>) => linhas.push(l) };
}

/** Nada do que é pessoal ou secreto aparece no log. */
function esperaLogLimpo(linhas: Array<Record<string, string | number>>): void {
  const texto = JSON.stringify(linhas);
  for (const proibido of [MENSAGEM.para, MENSAGEM.assunto, TOKEN, 'nova-senha', CONFIG.RESEND_API_KEY]) {
    expect(texto).not.toContain(proibido);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('remetenteResend', () => {
  it('ACE-52: 2xx vira enviado, com a chave, a idempotência, texto e html', async () => {
    const buscar = vi.fn(async () => resposta(200, { id: 'abc' }));
    const r = await remetenteResend(CONFIG, { fetch: buscar }).enviar(MENSAGEM);
    expect(r).toBe('enviado');
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_RESEND);
    const cabecalhos = new Headers(init.headers);
    expect(cabecalhos.get('authorization')).toBe(`Bearer ${CONFIG.RESEND_API_KEY}`);
    expect(cabecalhos.get('idempotency-key')).toBe(MENSAGEM.idempotencia);
    expect(JSON.parse(String(init.body))).toEqual({
      from: CONFIG.RESEND_REMETENTE,
      to: [MENSAGEM.para],
      subject: MENSAGEM.assunto,
      text: MENSAGEM.texto,
      html: MENSAGEM.html,
    });
  });

  it.each([
    [500, 'application_error'],
    [429, 'daily_quota_exceeded'],
    [403, 'validation_error'],
    [422, 'invalid_parameter'],
  ])('ACE-52: status %i vira falhou e o log tem só o status e o código', async (status, codigo) => {
    const log = comLog();
    const buscar = vi.fn(async () => resposta(status, { name: codigo, message: `falhou para ${MENSAGEM.para}` }));
    expect(await remetenteResend(CONFIG, { fetch: buscar, registrar: log.registrar }).enviar(MENSAGEM)).toBe('falhou');
    expect(log.linhas).toEqual([{ evento: 'email_falhou', tipo: 'recuperacao', status, codigo }]);
    esperaLogLimpo(log.linhas);
  });

  it('ACE-52: corpo de erro que não é JSON vira código desconhecido', async () => {
    const log = comLog();
    const buscar = vi.fn(async () => new Response('<html>erro</html>', { status: 502 }));
    await remetenteResend(CONFIG, { fetch: buscar, registrar: log.registrar }).enviar(MENSAGEM);
    expect(log.linhas).toEqual([{ evento: 'email_falhou', tipo: 'recuperacao', status: 502, codigo: 'desconhecido' }]);
  });

  it('ACE-52: rede caída (fetch lança) vira falhou', async () => {
    const log = comLog();
    const buscar = vi.fn(async () => {
      throw new TypeError(`falha de rede ao enviar para ${MENSAGEM.para}`);
    });
    expect(await remetenteResend(CONFIG, { fetch: buscar, registrar: log.registrar }).enviar(MENSAGEM)).toBe('falhou');
    expect(log.linhas).toEqual([{ evento: 'email_falhou', tipo: 'recuperacao', status: 0, codigo: 'rede' }]);
    esperaLogLimpo(log.linhas);
  });

  it('ACE-75: resposta que demora mais de 10 s é abortada e vira falhou', async () => {
    vi.useFakeTimers();
    const log = comLog();
    let sinal: AbortSignal | undefined;
    const buscar = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolver, rejeitar) => {
          sinal = init.signal ?? undefined;
          init.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
        }),
    );
    const envio = remetenteResend(CONFIG, { fetch: buscar as unknown as typeof fetch, registrar: log.registrar }).enviar(MENSAGEM);
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_MS - 1);
    expect(sinal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await envio).toBe('falhou');
    expect(sinal?.aborted).toBe(true);
    expect(log.linhas).toEqual([{ evento: 'email_falhou', tipo: 'recuperacao', status: 0, codigo: 'tempo_esgotado' }]);
    expect(TEMPO_LIMITE_MS).toBe(10_000);
  });

  it('ACE-75: resposta em 9,9 s ainda vale', async () => {
    vi.useFakeTimers();
    const buscar = vi.fn(() => new Promise<Response>((resolver) => setTimeout(() => resolver(resposta(200)), 9_900)));
    const envio = remetenteResend(CONFIG, { fetch: buscar as unknown as typeof fetch }).enviar(MENSAGEM);
    await vi.advanceTimersByTimeAsync(9_900);
    expect(await envio).toBe('enviado');
  });

  it('ACE-52: sem RESEND_API_KEY, falha sem chamar a rede', async () => {
    const buscar = vi.fn(async () => resposta(200));
    const log = comLog();
    const r = await remetenteResend({ RESEND_REMETENTE: CONFIG.RESEND_REMETENTE }, { fetch: buscar, registrar: log.registrar }).enviar(
      MENSAGEM,
    );
    expect(r).toBe('falhou');
    expect(buscar).not.toHaveBeenCalled();
    expect(log.linhas[0]).toMatchObject({ codigo: 'sem_configuracao' });
  });

  it('ACE-21: o sucesso não gera log nenhum', async () => {
    const log = comLog();
    await remetenteResend(CONFIG, { fetch: vi.fn(async () => resposta(200)), registrar: log.registrar }).enviar(MENSAGEM);
    expect(log.linhas).toEqual([]);
  });
});

describe('remetenteMemoria', () => {
  it('ACE-52: guarda as mensagens enviadas em ordem', async () => {
    const r = remetenteMemoria();
    await r.enviar(MENSAGEM);
    await r.enviar({ ...MENSAGEM, tipo: 'convite' });
    expect(r.mensagens.map((m) => m.tipo)).toEqual(['recuperacao', 'convite']);
  });

  it('ACE-52: falharProximos faz os próximos envios falharem sem guardar, e depois volta a enviar', async () => {
    const r = remetenteMemoria();
    r.falharProximos(1);
    expect(await r.enviar(MENSAGEM)).toBe('falhou');
    expect(r.mensagens).toHaveLength(0);
    expect(await r.enviar(MENSAGEM)).toBe('enviado');
    expect(r.mensagens).toHaveLength(1);
  });

  it('ACE-52: limpar esvazia a caixa', async () => {
    const r = remetenteMemoria();
    await r.enviar(MENSAGEM);
    r.limpar();
    expect(r.mensagens).toEqual([]);
  });
});
