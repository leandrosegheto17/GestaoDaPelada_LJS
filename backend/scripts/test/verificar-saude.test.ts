import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
// @ts-expect-error O script é JavaScript puro, sem declaração de tipos.
import { verificarSaude } from '../ops/verificar-saude.mjs';

const executar = promisify(execFile);

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const servidores: Server[] = [];

/** Sobe um servidor local; `respostas[i]` atende a i-ésima chamada (a última se repete). */
async function servidor(
  respostas: { status: number; corpo: unknown }[],
): Promise<{ url: string; chamadas: () => number }> {
  let n = 0;
  const s = createServer((_req, res) => {
    const r = respostas[Math.min(n, respostas.length - 1)]!;
    n++;
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo));
  });
  servidores.push(s);
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  const { port } = s.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, chamadas: () => n };
}
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise((ok) => s.close(ok))));
});

const rapido = { tentativas: 4, esperaMs: 5 };
const ok = { status: 200, corpo: { status: 'ok', versao: SHA } };

describe('verificarSaude', () => {
  test('FUN-42: versao igual ao SHA passa e consulta /api/health', async () => {
    const s = await servidor([ok]);
    const r = await verificarSaude(s.url, SHA, rapido);
    expect(r.ok).toBe(true);
    expect(s.chamadas()).toBe(1);
  });

  test('FUN-42: versao diferente reprova depois das tentativas, citando as duas versões', async () => {
    const s = await servidor([{ status: 200, corpo: { status: 'ok', versao: 'antiga' } }]);
    const r = await verificarSaude(s.url, SHA, rapido);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('antiga');
    expect(r.mensagem).toContain(SHA);
    expect(s.chamadas()).toBe(rapido.tentativas);
  });

  test('FUN-42: resposta 500 depois das tentativas reprova', async () => {
    const s = await servidor([{ status: 500, corpo: 'erro' }]);
    const r = await verificarSaude(s.url, SHA, rapido);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('500');
    expect(s.chamadas()).toBe(rapido.tentativas);
  });

  test('FUN-42: servidor que responde certo só na 3ª tentativa passa', async () => {
    const s = await servidor([{ status: 500, corpo: 'x' }, { status: 502, corpo: 'x' }, ok]);
    const r = await verificarSaude(s.url, SHA, rapido);
    expect(r.ok).toBe(true);
    expect(s.chamadas()).toBe(3);
  });

  test('FUN-42: corpo que não é JSON, ou sem versao, reprova', async () => {
    for (const corpo of ['<html>', { status: 'ok' }]) {
      const s = await servidor([{ status: 200, corpo }]);
      expect((await verificarSaude(s.url, SHA, { tentativas: 2, esperaMs: 1 })).ok).toBe(false);
    }
  });

  test('FUN-42: sem servidor ouvindo reprova sem lançar', async () => {
    const r = await verificarSaude('http://127.0.0.1:1', SHA, { tentativas: 2, esperaMs: 1 });
    expect(r.ok).toBe(false);
  });

  test('FUN-42: a barra final da URL não duplica o caminho', async () => {
    const s = await servidor([ok]);
    expect((await verificarSaude(`${s.url}/`, SHA, rapido)).ok).toBe(true);
  });

  test('FUN-42: a linha de comando sai com 0 quando a versão bate e com 1 quando não bate', async () => {
    const bom = await servidor([ok]);
    const ruim = await servidor([{ status: 200, corpo: { status: 'ok', versao: 'outra' } }]);
    const script = join(import.meta.dirname, '..', 'ops', 'verificar-saude.mjs');
    const env = { ...process.env, PELADA_SAUDE_TENTATIVAS: '2', PELADA_SAUDE_ESPERA_MS: '1' };
    const rodar = (url: string) =>
      executar(process.execPath, [script, url, SHA], { env }).then(
        () => 0,
        (e: { code?: number }) => e.code ?? -1,
      );
    const certo = { status: await rodar(bom.url) };
    const errado = { status: await rodar(ruim.url) };
    expect(certo.status).toBe(0);
    expect(errado.status).toBe(1);
  });
});
