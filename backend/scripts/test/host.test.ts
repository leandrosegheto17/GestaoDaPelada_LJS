import { createServer } from 'node:net';
import { describe, expect, test } from 'vitest';
import { exigirHostPermitido, HOSTS_LOCAIS } from '../src/host.js';

describe('trava de host do banco', () => {
  test.each(['localhost', '127.0.0.1', 'postgres'])('FUN-19: %s passa', (host) => {
    expect(() =>
      exigirHostPermitido(`postgres://u:p@${host}:5432/pelada`, HOSTS_LOCAIS),
    ).not.toThrow();
  });

  test('FUN-19: host *.neon.tech lança erro sem abrir socket', async () => {
    let conexoes = 0;
    const servidor = createServer(() => conexoes++);
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    expect(() =>
      exigirHostPermitido('postgres://u:p@ep-x.sa-east-1.aws.neon.tech/db', HOSTS_LOCAIS),
    ).toThrow(/não permitido/);
    await new Promise((ok) => setTimeout(ok, 50));
    servidor.close();
    expect(conexoes).toBe(0);
  });

  test('FUN-19: URL malformada lança erro e a senha não aparece na mensagem', () => {
    expect(() => exigirHostPermitido('isto não é url', HOSTS_LOCAIS)).toThrow();
    let mensagem = '';
    try {
      exigirHostPermitido('postgres://usuario:segredo123@ep-x.neon.tech/db', HOSTS_LOCAIS);
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).not.toContain('segredo123');
    expect(mensagem).not.toContain('usuario');
    try {
      exigirHostPermitido('postgres://usuario:segredo123@[::bad', HOSTS_LOCAIS);
    } catch (e) {
      expect((e as Error).message).not.toContain('segredo123');
    }
  });

  test('FUN-19: o .env.example lista as variáveis de banco sem valores reais', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const txt = readFileSync(join(import.meta.dirname, '..', '..', '..', '.env.example'), 'utf8');
    for (const v of [
      'DATABASE_URL',
      'DATABASE_URL_TESTE',
      'DATABASE_URL_MIGRACAO',
      'PELADA_APP_SENHA',
      'PELADA_BACKUP_RO_SENHA',
    ]) {
      expect(txt).toMatch(new RegExp(`^${v}=`, 'm'));
    }
    expect(txt).not.toMatch(/neon\.tech/);
  });
});
