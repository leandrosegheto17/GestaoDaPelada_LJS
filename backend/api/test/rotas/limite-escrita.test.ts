import { describe, expect, it } from 'vitest';
import type { Limitador } from '../../src/entrada/middlewares/limite-taxa.ts';
import { chamar, type RespostaTeste } from '../apoio/cliente.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Critério: SEC-003 (T74). Limite de taxa por conta nas escritas com sessão de /api/grupos*: a chave é a conta da
// sessão (não o IP), excedido dá 429 com Retry-After sem criar nada, leituras não contam e outra conta não é afetada.

/** Faixa de documentação (RFC 5737): as duas contas saem do mesmo IP. */
const IP = '203.0.113.7';

/** Limitador falso com contador por chave, como o binding de verdade (janela única, sem tempo). */
function limitadorDe(limite: number): Limitador & { chaves: string[] } {
  const contagem = new Map<string, number>();
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      const n = (contagem.get(key) ?? 0) + 1;
      contagem.set(key, n);
      return { success: n <= limite };
    },
  };
}

const grupoValido = () => ({
  nome: `Taxa ${crypto.randomUUID().slice(0, 8)}`,
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:30',
});

function pedir(
  metodo: string,
  caminho: string,
  s: SessaoDeTeste | null,
  escrita?: Limitador,
  corpo?: unknown,
): Promise<RespostaTeste> {
  const headers: Record<string, string> = { 'X-Pelada': '1', 'CF-Connecting-IP': IP };
  if (s) headers['Cookie'] = s.cookie;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method: metodo, headers };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  return chamar(caminho, init, escrita ? { app: { limitadores: { escrita } } } : {});
}

const ativos = async (s: SessaoDeTeste) =>
  ((await pedir('GET', '/api/grupos', s)).corpo as { ativos: { id: string }[] }).ativos;

describe('limite de escrita por conta em /api/grupos* (SEC-003)', () => {
  it('cria grupos em sequência até o limite; a seguinte dá 429 com Retry-After e não cria nada', async () => {
    const escrita = limitadorDe(2);
    const ana = await criarSessao();
    expect((await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).status).toBe(201);
    expect((await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).status).toBe(201);

    const r = await pedir('POST', '/api/grupos', ana, escrita, grupoValido());
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'muitas_requisicoes' } });
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await ativos(ana)).toHaveLength(2);
  });

  it('a chave é a conta da sessão, não o IP: outra conta do mesmo IP segue criando', async () => {
    const escrita = limitadorDe(1);
    const ana = await criarSessao();
    const bia = await criarSessao();
    expect((await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).status).toBe(201);
    expect((await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).status).toBe(429);
    expect((await pedir('POST', '/api/grupos', bia, escrita, grupoValido())).status).toBe(201);
    expect(escrita.chaves).toEqual([ana.contaId, ana.contaId, bia.contaId]);
    expect(escrita.chaves).not.toContain(IP);
  });

  it('leituras (GET) não contam nem são barradas depois do limite', async () => {
    const escrita = limitadorDe(1);
    const ana = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).corpo as { id: string };
    expect((await pedir('POST', '/api/grupos', ana, escrita, grupoValido())).status).toBe(429);
    const chavesAntes = escrita.chaves.length;
    for (const caminho of ['/api/grupos', `/api/grupos/${criado.id}`, `/api/grupos/${criado.id}/jogadores`]) {
      expect((await pedir('GET', caminho, ana, escrita)).status).toBe(200);
    }
    expect(escrita.chaves).toHaveLength(chavesAntes);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s em /api/grupos/:grupoId/* conta e é barrado', async (metodo) => {
    const ana = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', ana, limitadorDe(100), grupoValido())).corpo as {
      id: string;
      slug: string;
    };
    const escrita = limitadorDe(0);
    const r = await pedir(metodo, `/api/grupos/${criado.id}/jogadores`, ana, escrita, {});
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(escrita.chaves).toEqual([ana.contaId]);
  });

  it('PATCH barrado não altera o grupo', async () => {
    const ana = await criarSessao();
    const corpo = grupoValido();
    const criado = (await pedir('POST', '/api/grupos', ana, limitadorDe(100), corpo)).corpo as { id: string };
    const r = await pedir('PATCH', `/api/grupos/${criado.id}`, ana, limitadorDe(0), { ...corpo, nome: 'Outro Nome' });
    expect(r.status).toBe(429);
    const visto = await pedir('GET', `/api/grupos/${criado.id}`, ana);
    expect(visto.corpo).toMatchObject({ nome: corpo.nome });
  });

  it('sem sessão a escrita não consome o limite: 401 da rota, e o limitador nem é chamado', async () => {
    const escrita = limitadorDe(0);
    const r = await pedir('POST', '/api/grupos', null, escrita, grupoValido());
    expect(r.status).toBe(401);
    expect(escrita.chaves).toEqual([]);
  });

  it('caminhos fora de /api/grupos* (mesmo com o prefixo parecido) não passam pelo limite de escrita', async () => {
    const escrita = limitadorDe(0);
    const ana = await criarSessao();
    expect((await pedir('POST', '/api/gruposx', ana, escrita, {})).status).toBe(404);
    expect((await pedir('POST', '/api/sessao/sair', ana, escrita)).status).not.toBe(429);
    expect(escrita.chaves).toEqual([]);
  });

  it('com o binding LIMITE_ESCRITA do wrangler.jsonc: 60 escritas por minuto, a 61ª dá 429', async () => {
    const ana = await criarSessao();
    const bia = await criarSessao();
    // Corpo inválido (422): conta no limite sem gravar nada.
    for (let i = 0; i < 60; i++) {
      expect((await pedir('POST', '/api/grupos', ana, undefined, {})).status).toBe(422);
    }
    const r = await pedir('POST', '/api/grupos', ana, undefined, {});
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect((await pedir('POST', '/api/grupos', bia, undefined, {})).status).toBe(422);
  });
});
