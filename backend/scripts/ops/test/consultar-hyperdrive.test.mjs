import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../consultar-hyperdrive.sh', import.meta.url));

let servidor;
let pedidos;
let pasta;

beforeEach(async () => {
  pedidos = [];
  pasta = mkdtempSync(join(tmpdir(), 'hyperdrive-'));
  servidor = createServer((req, res) => {
    pedidos.push({ url: req.url, auth: req.headers.authorization });
    res.end('{"success":true}');
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
});

afterEach(async () => {
  await new Promise((ok) => servidor.close(ok));
  rmSync(pasta, { recursive: true, force: true });
});

const HOST = 'api.cloudflare.com';
const BASE_OK = `https://${HOST}/client/v4`;

// Shim de curl no PATH: redireciona o host da Cloudflare para o servidor local,
// sem afrouxar a validação do script.
const instalarShim = () => {
  const real = spawnSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8' }).stdout.trim();
  const bin = join(pasta, 'bin');
  mkdirSync(bin);
  const alvo = `http://127.0.0.1:${servidor.address().port}`;
  const shim = [
    '#!/usr/bin/env bash',
    'args=()',
    'for a in "$@"; do',
    `  args+=("\${a/https:\\/\\/${HOST}/${alvo.replace(/\//g, '\\/')}}")`,
    'done',
    `exec "${real}" "\${args[@]}"`,
    '',
  ].join('\n');
  writeFileSync(join(bin, 'curl'), shim, { mode: 0o755 });
  return bin;
};

const rodar = (token, { comBase = true, base = BASE_OK } = {}) =>
  new Promise((ok) => {
    const bin = instalarShim();
    const env = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: 'conta',
      CLOUDFLARE_API_BASE: base,
    };
    if (!comBase) delete env.CLOUDFLARE_API_BASE;
    const filho = spawn('bash', [SCRIPT, 'cfg1'], { cwd: pasta, env });
    let out = '';
    let err = '';
    filho.stdout.on('data', (d) => (out += d));
    filho.stderr.on('data', (d) => (err += d));
    filho.on('close', (rc) => ok({ rc, out, err }));
  });

describe('consultar-hyperdrive.sh', () => {
  it('token hostil não cria arquivo, não faz requisição e sai com rc 1 sem ecoar o valor', async () => {
    const hostil = `x"\noutput = "f"`;
    const r = await rodar(hostil);
    expect(r.rc).toBe(1);
    expect(pedidos).toHaveLength(0);
    expect(existsSync(join(pasta, 'f'))).toBe(false);
    expect(r.err + r.out).not.toContain('output');
  });

  it('token vazio falha fechado', async () => {
    expect((await rodar('')).rc).toBe(1);
    expect(pedidos).toHaveLength(0);
  });

  it('sem CLOUDFLARE_API_BASE falha fechado com rc 1, sem requisição e sem eco do token', async () => {
    const r = await rodar('abc_DEF-123', { comBase: false });
    expect(r.rc).toBe(1);
    expect(pedidos).toHaveLength(0);
    expect(r.err).toContain('CLOUDFLARE_API_BASE');
    expect(r.err + r.out).not.toContain('abc_DEF-123');
  });

  it.each([
    ['http', `http://${HOST}/client/v4`],
    ['host alheio', 'https://evil.example/client/v4'],
    ['user@host', `https://${HOST}@evil.example/client/v4`],
    ['user@ antes do host', `https://user@${HOST}/client/v4`],
    ['porta', `https://${HOST}:8443/client/v4`],
    ['sufixo', `https://${HOST}.evil.example/client/v4`],
    ['prefixo', `https://evil.${HOST}/client/v4`],
    ['maiúsculas', 'https://API.Cloudflare.com/client/v4'],
    ['espaço', `https://${HOST}/client/v4 --x`],
    ['quebra de linha', `https://${HOST}/client/v4\nhttps://evil.example`],
    ['query', `https://${HOST}/client/v4?x=1`],
    ['loopback http', 'http://127.0.0.1:1'],
    ['vazio', ''],
  ])('base inválida (%s) sai com rc 1, sem requisição e sem eco', async (_nome, base) => {
    const r = await rodar('abc_DEF-123', { base });
    expect(r.rc).toBe(1);
    expect(pedidos).toHaveLength(0);
    expect(r.err + r.out).not.toContain('abc_DEF-123');
    expect(r.err + r.out).not.toContain('evil');
  });

  it('token válido faz uma requisição com o cabeçalho Bearer', async () => {
    const r = await rodar('abc_DEF-123');
    expect(r.rc).toBe(0);
    expect(pedidos).toEqual([{ url: '/client/v4/accounts/conta/hyperdrive/configs/cfg1', auth: 'Bearer abc_DEF-123' }]);
    expect(r.out).toContain('"success":true');
  });
});
