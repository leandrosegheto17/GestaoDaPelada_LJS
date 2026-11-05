import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verificarSaude } from '../verificar-saude.mjs';

/**
 * Saúde pós-deploy (FUN-42), contra um servidor HTTP local: a resposta de cada tentativa vem de
 * uma lista; acabada a lista, repete a última.
 */

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

interface Resposta {
  status: number;
  corpo?: unknown;
}

let servidor: Server | undefined;

afterEach(async () => {
  await new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r()));
  servidor = undefined;
});

/** Sobe o servidor e devolve a URL base e o contador de pedidos a /api/health. */
async function subir(respostas: Resposta[]): Promise<{ url: string; pedidos: () => number }> {
  let n = 0;
  const s = createServer((req, res) => {
    if (req.url !== '/api/health') {
      res.writeHead(404).end();
      return;
    }
    const r = respostas[Math.min(n, respostas.length - 1)] as Resposta;
    n += 1;
    res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(r.corpo ?? {}));
  });
  servidor = s;
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const { port } = s.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, pedidos: () => n };
}

const ok = (versao = SHA): Resposta => ({ status: 200, corpo: { status: 'ok', versao } });

describe('verificação de saúde pós-deploy', () => {
  it('FUN-42: versao igual ao SHA passa na primeira tentativa', async () => {
    const s = await subir([ok()]);
    const r = await verificarSaude({ url: s.url, sha: SHA, tentativas: 3, esperaMs: 1 });
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(1);
    expect(s.pedidos()).toBe(1);
  });

  it('FUN-42: versao diferente depois das tentativas reprova', async () => {
    const s = await subir([ok('sha-antigo')]);
    const r = await verificarSaude({ url: s.url, sha: SHA, tentativas: 3, esperaMs: 1 });
    expect(r.ok).toBe(false);
    expect(s.pedidos()).toBe(3);
    expect(r.mensagem).toContain('sha-antigo');
  });

  it('FUN-42: resposta 500 depois das tentativas reprova', async () => {
    const s = await subir([{ status: 500, corpo: { erro: 'x' } }]);
    const r = await verificarSaude({ url: s.url, sha: SHA, tentativas: 3, esperaMs: 1 });
    expect(r.ok).toBe(false);
    expect(s.pedidos()).toBe(3);
    expect(r.mensagem).toContain('500');
  });

  it('FUN-42: servidor que responde certo na 3ª tentativa passa', async () => {
    const s = await subir([{ status: 503 }, ok('sha-antigo'), ok()]);
    const r = await verificarSaude({ url: s.url, sha: SHA, tentativas: 5, esperaMs: 1 });
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(3);
    expect(s.pedidos()).toBe(3);
  });

  it('FUN-42: servidor fora do ar reprova depois das tentativas', async () => {
    const s = await subir([ok()]);
    await new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r()));
    servidor = undefined;
    const r = await verificarSaude({ url: s.url, sha: SHA, tentativas: 2, esperaMs: 1 });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('sem resposta');
  });

  it('FUN-42: URL com barra no fim consulta /api/health do mesmo jeito', async () => {
    const s = await subir([ok()]);
    expect((await verificarSaude({ url: `${s.url}/`, sha: SHA, tentativas: 1, esperaMs: 1 })).ok).toBe(true);
  });

  it('FUN-42: URL ou SHA vazio reprova sem consultar', async () => {
    expect((await verificarSaude({ url: '', sha: SHA })).ok).toBe(false);
    expect((await verificarSaude({ url: 'http://127.0.0.1:1', sha: '' })).ok).toBe(false);
  });

  it('FUN-42: na linha de comando, versão diferente sai com código 1', async () => {
    const s = await subir([ok('sha-antigo')]);
    const codigo = await new Promise<number | null>((resolver) => {
      const filho = spawn(process.execPath, [join(import.meta.dirname, '..', 'verificar-saude.mjs')], {
        env: {
          PATH: process.env.PATH ?? '',
          URL_PUBLICA: s.url,
          GITHUB_SHA: SHA,
          PELADA_SAUDE_TENTATIVAS: '2',
          PELADA_SAUDE_ESPERA_MS: '1',
        },
        stdio: 'ignore',
      });
      filho.on('exit', resolver);
    });
    expect(codigo).toBe(1);
  });
});
