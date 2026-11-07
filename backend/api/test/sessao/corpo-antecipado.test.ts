import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { LIMITE_CORPO_GRUPO_BYTES } from '../../src/entrada/middlewares/corpo-antecipado.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaEspiada } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Corpo das escritas de `/api/grupos*` lido e limitado antes de qualquer conexão (SV-01, SV-04; SEC-003, SEC-007):
 * um corpo lento não pode segurar transação aberta nem a trava do grupo, e corpo acima de 16 KB dá 413. O app é o
 * real, como `pelada_app`, contra o cenário de grupos.
 */

let aberto: CenarioGruposAberto;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

const permite = { limit: async () => ({ success: true }) };

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

function cabecalhos(token: string): Headers {
  return new Headers({
    'cf-connecting-ip': '203.0.113.71',
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${token}`,
  });
}

describe('corpo grande (SV-04)', () => {
  const grande = JSON.stringify({ nome: 'x'.repeat(LIMITE_CORPO_GRUPO_BYTES + 1) });

  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${metodo} com corpo acima do limite dá 413 e não abre conexão`, async () => {
      const espia = fabricaEspiada();
      const app = criarApp({ fabricaBanco: espia.fabrica });
      const token = await sessao(aberto.cenario.contaC);
      const ctx = contextoFalso();
      const r = await app.request(
        `/api/grupos/${aberto.cenario.grupoG}/jogadores`,
        { method: metodo, headers: cabecalhos(token), body: grande },
        envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
        ctx,
      );
      await ctx.esperar();
      expect(r.status).toBe(413);
      expect((await r.json()) as { erro: string }).toEqual({
        erro: 'O corpo da requisição é grande demais.',
      });
      expect(espia.criadas()).toBe(0);
    });
  }

  it('corpo exatamente no limite passa do 413 (a rota responde o seu 422)', async () => {
    const app = criarApp({ fabricaBanco: fabricaEspiada().fabrica });
    const token = await sessao(aberto.cenario.contaC);
    const base = JSON.stringify({ apelido: '' });
    const corpo = base + ' '.repeat(LIMITE_CORPO_GRUPO_BYTES - base.length);
    const ctx = contextoFalso();
    const r = await app.request(
      `/api/grupos/${aberto.cenario.grupoG}/jogadores`,
      { method: 'POST', headers: cabecalhos(token), body: corpo },
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(422);
  });
});

describe('corpo lento (SV-01)', () => {
  it('nenhuma conexão abre enquanto o corpo não chegou; depois a rota responde', async () => {
    const espia = fabricaEspiada();
    const app = criarApp({ fabricaBanco: espia.fabrica });
    const token = await sessao(aberto.cenario.contaC);
    const bytes = new TextEncoder().encode(
      JSON.stringify({ apelido: 'Lento', anoNascimento: 1990, posicao: 'meia' }),
    );
    let terminar!: () => void;
    const fim = new Promise<void>((res) => {
      terminar = res;
    });
    const corpo = new ReadableStream<Uint8Array>({
      async start(controle) {
        controle.enqueue(bytes.slice(0, 5));
        await fim;
        controle.enqueue(bytes.slice(5));
        controle.close();
      },
    });
    const ctx = contextoFalso();
    const pedido = app.request(
      `/api/grupos/${aberto.cenario.grupoG}/jogadores`,
      {
        method: 'POST',
        headers: cabecalhos(token),
        body: corpo,
        duplex: 'half',
      } as RequestInit,
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await new Promise((res) => setTimeout(res, 400));
    expect(espia.criadas()).toBe(0);
    terminar();
    const r = await pedido;
    await ctx.esperar();
    expect(r.status).toBe(201);
    expect(espia.criadas()).toBeGreaterThan(0);
    const gravado = await aberto.db.query('SELECT 1 FROM jogadores WHERE apelido = $1', ['Lento']);
    expect(gravado.rowCount).toBe(1);
    await aberto.db.query('DELETE FROM jogadores WHERE grupo_id = $1 AND apelido = $2', [
      aberto.cenario.grupoG,
      'Lento',
    ]);
  });
});

describe('corpo lento com Content-Length declarado (SV-01)', () => {
  it('o bodyLimit não lê o corpo quando há Content-Length: nenhuma conexão abre antes de o corpo chegar', async () => {
    const espia = fabricaEspiada();
    const app = criarApp({ fabricaBanco: espia.fabrica });
    const token = await sessao(aberto.cenario.contaC);
    const bytes = new TextEncoder().encode(
      JSON.stringify({ apelido: 'Lento CL', anoNascimento: 1990, posicao: 'meia' }),
    );
    let terminar!: () => void;
    const fim = new Promise<void>((res) => {
      terminar = res;
    });
    const corpo = new ReadableStream<Uint8Array>({
      async start(controle) {
        controle.enqueue(bytes.slice(0, 5));
        await fim;
        controle.enqueue(bytes.slice(5));
        controle.close();
      },
    });
    const headers = cabecalhos(token);
    headers.set('content-length', String(bytes.length));
    const ctx = contextoFalso();
    const pedido = app.request(
      `/api/grupos/${aberto.cenario.grupoG}/jogadores`,
      { method: 'POST', headers, body: corpo, duplex: 'half' } as RequestInit,
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await new Promise((res) => setTimeout(res, 400));
    expect(espia.criadas()).toBe(0);
    terminar();
    const r = await pedido;
    await ctx.esperar();
    expect(r.status).toBe(201);
    await aberto.db.query('DELETE FROM jogadores WHERE grupo_id = $1 AND apelido = $2', [
      aberto.cenario.grupoG,
      'Lento CL',
    ]);
  });
});

describe('POST /api/grupos (raiz da coleção)', () => {
  it('o corpo chega à rota uma vez só: 201 e o grupo gravado', async () => {
    const app = criarApp({ fabricaBanco: fabricaEspiada().fabrica });
    const token = await sessao(aberto.cenario.contaB);
    const ctx = contextoFalso();
    const r = await app.request(
      '/api/grupos',
      {
        method: 'POST',
        headers: cabecalhos(token),
        body: JSON.stringify({
          nome: 'Pelada Corpo Antes',
          diaSemana: 'sabado',
          frequencia: 'semanal',
          horario: '09:00',
        }),
      },
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(201);
  });

  it('corpo acima do limite dá 413 também na raiz', async () => {
    const app = criarApp({ fabricaBanco: fabricaEspiada().fabrica });
    const token = await sessao(aberto.cenario.contaB);
    const ctx = contextoFalso();
    const r = await app.request(
      '/api/grupos',
      {
        method: 'POST',
        headers: cabecalhos(token),
        body: JSON.stringify({ nome: 'x'.repeat(LIMITE_CORPO_GRUPO_BYTES + 1) }),
      },
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(413);
  });
});

describe('GET não lê corpo', () => {
  it('GET passa sem o limite', async () => {
    const app = criarApp({ fabricaBanco: fabricaEspiada().fabrica });
    const token = await sessao(aberto.cenario.contaC);
    const ctx = contextoFalso();
    const r = await app.request(
      `/api/grupos/${aberto.cenario.grupoG}`,
      { method: 'GET', headers: cabecalhos(token) },
      envAcesso(aberto.url, { LIMITE_ESCRITA: permite }),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(200);
  });
});
