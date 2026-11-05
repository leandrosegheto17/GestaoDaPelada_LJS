import { describe, expect, it } from 'vitest';
import { exigirHostPermitido, HOSTS_LOCAIS, HOSTS_TESTE } from '../src/host.ts';

describe('exigirHostPermitido', () => {
  for (const host of ['localhost', '127.0.0.1', 'postgres']) {
    it(`FUN-19: aceita o host ${host} na lista de teste`, () => {
      expect(exigirHostPermitido(`postgres://u:p@${host}:5432/db`, HOSTS_TESTE)).toBe(host);
    });
  }

  it('FUN-19: aceita host em caixa alta', () => {
    expect(exigirHostPermitido('postgres://u:p@LOCALHOST:5432/db', HOSTS_TESTE)).toBe('localhost');
  });

  it('FUN-19: recusa host do Neon', () => {
    expect(() =>
      exigirHostPermitido('postgres://u:p@ep-abc-123.sa-east-1.aws.neon.tech/neondb', HOSTS_TESTE),
    ).toThrow(/não permitido/);
  });

  it('FUN-05: a lista local recusa o serviço postgres do CI', () => {
    expect(() => exigirHostPermitido('postgres://u:p@postgres:5432/db', HOSTS_LOCAIS)).toThrow(
      /não permitido/,
    );
  });

  it('FUN-05: a lista padrão é a local', () => {
    expect(() => exigirHostPermitido('postgres://u:p@10.0.0.5:5432/db')).toThrow(/não permitido/);
    expect(exigirHostPermitido('postgres://u:p@127.0.0.1:5432/db')).toBe('127.0.0.1');
  });

  it('FUN-19: URL malformada lança erro', () => {
    expect(() => exigirHostPermitido('isto não é url', HOSTS_TESTE)).toThrow(/malformada/);
  });

  it('FUN-19: URL vazia ou ausente lança erro', () => {
    expect(() => exigirHostPermitido('', HOSTS_TESTE)).toThrow(/não definida/);
    expect(() => exigirHostPermitido(undefined, HOSTS_TESTE)).toThrow(/não definida/);
  });

  it('FUN-19: usuário e senha nunca aparecem na mensagem', () => {
    let mensagem = '';
    try {
      exigirHostPermitido('postgres://usuario_secreto:senha_secreta@ep-x.neon.tech/db', HOSTS_TESTE);
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).not.toBe('');
    expect(mensagem).not.toContain('usuario_secreto');
    expect(mensagem).not.toContain('senha_secreta');
  });

  it('FUN-19: senha não aparece na mensagem de URL malformada', () => {
    let mensagem = '';
    try {
      exigirHostPermitido('postgres://u:senha_secreta@[malformado/db', HOSTS_TESTE);
    } catch (e) {
      mensagem = (e as Error).message;
    }
    expect(mensagem).not.toContain('senha_secreta');
  });
});
