import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { exigirBancoNoAr } from '../comum/exigir-banco.ts';

const servidores: Server[] = [];

async function ouvir(): Promise<number> {
  const servidor = createServer();
  servidores.push(servidor);
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  return (servidor.address() as { port: number }).port;
}

async function portaFechada(): Promise<number> {
  const porta = await ouvir();
  await new Promise((ok) => servidores.pop()!.close(ok));
  return porta;
}

afterEach(async () => {
  while (servidores.length) await new Promise((ok) => servidores.pop()!.close(ok));
});

describe('banco local fora do ar (FUN-53)', () => {
  it('falha com a instrução "docker compose up -d" quando nada responde na porta', async () => {
    const porta = await portaFechada();
    await expect(exigirBancoNoAr(`postgres://u:p@127.0.0.1:${porta}/pelada`)).rejects.toThrow(
      /Rode `docker compose up -d`/,
    );
  });

  it('falha com a mesma instrução quando a URL do banco é inválida ou está ausente', async () => {
    await expect(exigirBancoNoAr('isso não é uma url')).rejects.toThrow(/Rode `docker compose up -d`/);
    await expect(exigirBancoNoAr(undefined)).rejects.toThrow(/Rode `docker compose up -d`/);
  });

  it('não vaza usuário nem senha da URL na mensagem', async () => {
    const porta = await portaFechada();
    const erro = await exigirBancoNoAr(`postgres://usuario:segredo@127.0.0.1:${porta}/pelada`).catch((e: Error) => e);
    expect((erro as Error).message).not.toMatch(/usuario|segredo/);
  });

  it('segue em frente quando o banco responde', async () => {
    const porta = await ouvir();
    await expect(exigirBancoNoAr(`postgres://u:p@127.0.0.1:${porta}/pelada`)).resolves.toBeUndefined();
  });
});
