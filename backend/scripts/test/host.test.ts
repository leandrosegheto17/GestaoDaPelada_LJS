import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { exigirHostPermitido } from '../src/host.js';

const permitidos = ['localhost', '127.0.0.1', 'postgres'];

function mensagemDe(url: string): string {
  try {
    exigirHostPermitido(url, permitidos);
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

describe('exigirHostPermitido', () => {
  test.each(['localhost', '127.0.0.1', 'postgres'])('FUN-19: %s passa', (host) => {
    expect(() => exigirHostPermitido(`postgres://u:s@${host}:5432/db`, permitidos)).not.toThrow();
  });

  test('FUN-19: host neon.tech lança erro sem abrir socket', () => {
    expect(() =>
      exigirHostPermitido('postgres://dono:segredo123@ep-x.us-east-2.aws.neon.tech/db', permitidos),
    ).toThrow(/host/i);
  });

  test('FUN-19: URL malformada lança erro sem vazar credenciais', () => {
    const msg = mensagemDe('postgres://dono:segredo123@@@::/db');
    expect(msg).not.toBe('');
    expect(msg).not.toContain('segredo123');
    expect(msg).not.toContain('dono');
  });

  test('FUN-19: usuário e senha nunca aparecem na mensagem do host proibido', () => {
    const msg = mensagemDe('postgres://dono:segredo123@ep-x.neon.tech/db');
    expect(msg).toContain('ep-x.neon.tech');
    expect(msg).not.toContain('segredo123');
    expect(msg).not.toContain('dono');
  });
});

test('FUN-05: o .env.example lista as variáveis de banco sem valores reais', () => {
  const texto = readFileSync(resolve(import.meta.dirname, '../../../.env.example'), 'utf8');
  for (const nome of [
    'DATABASE_URL',
    'DATABASE_URL_TESTE',
    'DATABASE_URL_MIGRACAO',
    'PELADA_APP_SENHA',
    'PELADA_BACKUP_RO_SENHA',
  ]) {
    expect(texto).toMatch(new RegExp(`^${nome}=`, 'm'));
  }
  expect(texto).not.toMatch(/neon\.tech/);
});
