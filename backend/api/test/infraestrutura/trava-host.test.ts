// Copiado do legado; prova a trava de host usada por migrar, seed e apoio de teste (FUN-05).
import { describe, expect, it } from 'vitest';
import { exigirHostPermitido, HostRecusado } from '../../src/infraestrutura/seguranca/trava-host.js';

const recusa = (opcoes: Parameters<typeof exigirHostPermitido>[0]) =>
  expect(exigirHostPermitido(opcoes)).rejects.toBeInstanceOf(HostRecusado);

describe('trava de host: locais passam sem alvo', () => {
  it.each([
    'postgres://u:s@localhost:5432/x',
    'postgres://u:s@LOCALHOST/x',
    'postgres://u:s@LocalHost:5432/x',
    'postgres://u:s@127.0.0.1/x',
    'postgres://u:s@127.1.2.3/x',
    'postgres://u:s@[::1]/x',
    'postgres://u:s@db/x',
  ])('%s', async (url) => {
    await expect(exigirHostPermitido({ url })).resolves.toBeTypeOf('string');
  });
});

describe('trava de host: tudo o mais exige alvo e confirmação', () => {
  it.each([
    'postgres://u:s@localhost.algo.com/x',
    'postgres://u:s@algo.localhost.com/x',
    'postgres://u:s@ep-x.sa-east-1.aws.neon.tech/x',
    'postgres://u:s@[::ffff:808:808]/x',
    'postgres://u:s@[::2]/x',
    'postgres://u:s@128.0.0.1/x',
    'postgres://u:s@127.0.0.256/x',
  ])('%s sem alvo é recusado', async (url) => {
    await recusa({ url });
  });

  it.each([
    'postgres://u:s@localhost,remoto/x',
    'postgres://localhost/x?host=remoto',
    'postgres://localhost/x?hostaddr=1.2.3.4',
    'postgres://u:s@/x',
    'postgres://%2Fvar%2Frun%2Fpostgresql/x',
    'lixo',
    '',
  ])('%j é recusado mesmo com alvo e CI', async (url) => {
    await recusa({ url, alvo: 'producao', ci: 'true' });
  });

  it('url ausente é recusada', async () => {
    await recusa({ url: undefined });
  });

  const remoto = 'postgres://u:s@ep-x.aws.neon.tech/x';
  it('alvo inválido é recusado', async () => {
    await recusa({ url: remoto, alvo: 'outro', ci: 'true' });
  });
  it('alvo válido sem CI e sem confirmação é recusado', async () => {
    await recusa({ url: remoto, alvo: 'producao' });
  });
  it('confirmação diferente (caixa ou espaço) é recusada', async () => {
    await recusa({ url: remoto, alvo: 'teste', confirmar: () => 'EP-X.AWS.NEON.TECH' });
    await recusa({ url: remoto, alvo: 'teste', confirmar: () => 'ep-x.aws.neon.tech ' });
  });
  it('alvo com CI=true ou confirmação exata passa', async () => {
    await expect(exigirHostPermitido({ url: remoto, alvo: 'producao', ci: 'true' })).resolves.toBe(
      'ep-x.aws.neon.tech',
    );
    await expect(
      exigirHostPermitido({
        url: remoto,
        alvo: 'teste',
        confirmar: async () => 'ep-x.aws.neon.tech',
      }),
    ).resolves.toBe('ep-x.aws.neon.tech');
  });
  it('a mensagem de erro não contém a senha', async () => {
    const erro = await exigirHostPermitido({
      url: 'postgres://u:senha-secreta@ep-x.aws.neon.tech/x',
    }).catch((e: Error) => e);
    expect((erro as Error).message).not.toContain('senha-secreta');
    const invalida = await exigirHostPermitido({ url: 'postgres://u:senha-secreta@/x' }).catch((e: Error) => e);
    expect((invalida as Error).message).not.toContain('senha-secreta');
  });
});
