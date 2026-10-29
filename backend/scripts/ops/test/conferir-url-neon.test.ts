// ADR-032: o dump cifrado (backup e deploy) confere a URL do Neon antes de conectar.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main } from '../conferir-url-neon.ts';

const script = fileURLToPath(new URL('../conferir-url-neon-cli.ts', import.meta.url));
const HOST = 'ep-calmo-rio-123456.sa-east-1.aws.neon.tech';
const BACKUP = `postgres://pelada_backup_ro:s3gr3do@${HOST}/pelada?sslmode=require`;
const OWNER = `postgres://pelada_owner:s3gr3do@${HOST}/pelada?sslmode=require`;

const rodar = (url: string | undefined, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env['PATH'], ...(url === undefined ? {} : { PG_URL: url }) },
  });

describe('conferir-url-neon (main)', () => {
  it('aceita a URL do papel indicado', () => {
    expect(main(['--papel', 'backup', '--executar'], { PG_URL: BACKUP })).toBe(0);
    expect(main(['--papel', 'owner', '--executar'], { PG_URL: OWNER })).toBe(0);
  });

  it.each([
    ['sem --executar', ['--papel', 'backup'], BACKUP],
    ['sem papel', ['--executar'], BACKUP],
    ['papel desconhecido', ['--papel', 'raiz', '--executar'], BACKUP],
    ['papel herdado de Object', ['--papel', 'toString', '--executar'], BACKUP],
    ['URL ausente', ['--papel', 'backup', '--executar'], undefined],
    ['papel trocado', ['--papel', 'backup', '--executar'], OWNER],
    ['pooler', ['--papel', 'backup', '--executar'], BACKUP.replace('123456.', '123456-pooler.')],
    ['sem TLS', ['--papel', 'backup', '--executar'], BACKUP.replace('?sslmode=require', '')],
    ['outro database', ['--papel', 'backup', '--executar'], BACKUP.replace('/pelada?', '/neondb?')],
    ['local', ['--papel', 'backup', '--executar'], 'postgres://pelada_backup_ro:x@localhost/pelada?sslmode=require'],
  ])('recusa: %s', (_nome, argv, url) => {
    expect(main(argv, { PG_URL: url })).toBe(1);
  });
});

describe('conferir-url-neon-cli (processo)', () => {
  it('URL válida sai com 0', () => {
    expect(rodar(BACKUP, '--papel', 'backup', '--executar').status).toBe(0);
  });

  it('URL recusada sai com 1 e não imprime a URL nem a senha', () => {
    const r = rodar(BACKUP.replace('?sslmode=require', ''), '--papel', 'backup', '--executar');
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).not.toContain('s3gr3do');
    expect(`${r.stdout}${r.stderr}`).not.toContain('postgres://');
  });
});
