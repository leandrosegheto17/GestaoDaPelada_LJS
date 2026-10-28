// ADR-032: validação única do destino no Neon (recusa pooler, local, sem TLS, fora de .neon.tech, usuário errado).
import { describe, expect, it } from 'vitest';
import { HostRecusado } from '../../src/infraestrutura/seguranca/trava-host.ts';
import {
  conferirDestinoNeon,
  conferirUrlNeon,
  ROLES_NEON,
  UrlNeonRecusada,
} from '../../src/infraestrutura/seguranca/url-neon.ts';

const HOST = 'ep-calmo-rio-123456.sa-east-1.aws.neon.tech';
const url = (usuario: string, resto = `${HOST}/pelada?sslmode=require`) => `postgres://${usuario}:s3gr3do@${resto}`;

describe('roles padronizadas', () => {
  it('owner, app e backup seguem <projeto>_owner, _app e _backup_ro', () => {
    expect(ROLES_NEON).toEqual({ owner: 'pelada_owner', app: 'pelada_app', backup: 'pelada_backup_ro' });
  });
});

describe('conferirUrlNeon: aceita', () => {
  it.each([
    ['owner', url('pelada_owner')],
    ['app', url('pelada_app')],
    ['backup', url('pelada_backup_ro')],
  ] as const)('a conexão direta com TLS do papel %s', (papel, u) => {
    expect(conferirUrlNeon(u, papel)).toEqual({ host: HOST, banco: 'pelada', usuario: ROLES_NEON[papel] });
  });

  it.each(['require', 'verify-ca', 'verify-full'])('sslmode=%s', (modo) => {
    expect(() => conferirUrlNeon(url('pelada_owner', `${HOST}/pelada?sslmode=${modo}`), 'owner')).not.toThrow();
  });

  it('postgresql://, host em maiúsculas e channel_binding', () => {
    const u = `postgresql://pelada_owner:x@${HOST.toUpperCase()}/pelada?sslmode=require&channel_binding=require`;
    expect(conferirUrlNeon(u, 'owner').host).toBe(HOST);
  });
});

describe('conferirUrlNeon: recusa', () => {
  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['inválida', 'não é url'],
    ['outro protocolo', `mysql://pelada_owner:x@${HOST}/pelada?sslmode=require`],
    ['localhost', url('pelada_owner', 'localhost:5432/pelada?sslmode=require')],
    ['127.0.0.1', url('pelada_owner', '127.0.0.1/pelada?sslmode=require')],
    ['::1', url('pelada_owner', '[::1]/pelada?sslmode=require')],
    ['host do compose', url('pelada_owner', 'db/pelada?sslmode=require')],
    ['fora de .neon.tech', url('pelada_owner', 'ep-x.sa-east-1.aws.neon.tech.exemplo.com/pelada?sslmode=require')],
    ['sufixo parecido', url('pelada_owner', 'ep-x.falsoneon.tech/pelada?sslmode=require')],
    ['pooler', url('pelada_owner', 'ep-calmo-rio-123456-pooler.sa-east-1.aws.neon.tech/pelada?sslmode=require')],
    ['pooler em maiúsculas', url('pelada_owner', 'EP-X-POOLER.sa-east-1.aws.neon.tech/pelada?sslmode=require')],
    ['sem sslmode', url('pelada_owner', `${HOST}/pelada`)],
    ['sslmode=disable', url('pelada_owner', `${HOST}/pelada?sslmode=disable`)],
    ['sslmode=prefer', url('pelada_owner', `${HOST}/pelada?sslmode=prefer`)],
    ['sslmode=allow', url('pelada_owner', `${HOST}/pelada?sslmode=allow`)],
    ['sslmode repetido', url('pelada_owner', `${HOST}/pelada?sslmode=require&sslmode=disable`)],
    ['host na consulta', url('pelada_owner', `${HOST}/pelada?sslmode=require&host=localhost`)],
    ['usuário na consulta', url('pelada_owner', `${HOST}/pelada?sslmode=require&user=postgres`)],
    ['banco na consulta', url('pelada_owner', `${HOST}/pelada?sslmode=require&dbname=outro`)],
    ['options na consulta', url('pelada_owner', `${HOST}/pelada?sslmode=require&options=-c%20role%3Dx`)],
    ['sem banco', url('pelada_owner', `${HOST}/?sslmode=require`)],
    ['vários hosts', url('pelada_owner', `${HOST},outro.neon.tech/pelada?sslmode=require`)],
  ])('%s', (_nome, u) => {
    expect(() => conferirUrlNeon(u, 'owner')).toThrow(UrlNeonRecusada);
  });

  it.each([
    ['owner com o usuário do app', 'pelada_app', 'owner'],
    ['app com o owner (bypassrls)', 'pelada_owner', 'app'],
    ['backup com o nome antigo', 'pelada_backup', 'backup'],
    ['owner padrão do Neon', 'neondb_owner', 'owner'],
    ['app sem usuário', '', 'app'],
  ] as const)('usuário fora do papel: %s', (_nome, usuario, papel) => {
    expect(() => conferirUrlNeon(url(usuario), papel)).toThrow(UrlNeonRecusada);
  });

  it('a recusa é um HostRecusado (os scripts já mostram a mensagem dele) e nunca traz a senha', () => {
    try {
      conferirUrlNeon(url('pelada_owner', `${HOST}/pelada`), 'owner');
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(HostRecusado);
      expect((erro as Error).message).not.toContain('s3gr3do');
    }
  });
});

describe('conferirDestinoNeon (origem do Hyperdrive, sem URL)', () => {
  it('aceita host direto do Neon e o usuário do papel', () => {
    expect(conferirDestinoNeon({ host: HOST, banco: 'pelada', usuario: 'pelada_app' }, 'app')).toEqual({
      host: HOST,
      banco: 'pelada',
      usuario: 'pelada_app',
    });
  });

  it.each([
    ['host ausente', { banco: 'pelada', usuario: 'pelada_app' }],
    ['host numérico', { host: 5432, banco: 'pelada', usuario: 'pelada_app' }],
    ['pooler', { host: 'ep-x-pooler.sa-east-1.aws.neon.tech', banco: 'pelada', usuario: 'pelada_app' }],
    ['local', { host: 'localhost', banco: 'pelada', usuario: 'pelada_app' }],
    ['fora do Neon', { host: 'banco.exemplo.com', banco: 'pelada', usuario: 'pelada_app' }],
    ['owner como origem', { host: HOST, banco: 'pelada', usuario: 'pelada_owner' }],
    ['usuário ausente', { host: HOST, banco: 'pelada' }],
    ['banco ausente', { host: HOST, usuario: 'pelada_app' }],
  ])('recusa: %s', (_nome, partes) => {
    expect(() => conferirDestinoNeon(partes, 'app')).toThrow(UrlNeonRecusada);
  });
});
