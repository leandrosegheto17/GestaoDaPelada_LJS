import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContainerAge, SCRIPT_DUMP } from './apoio/container.ts';

// Roda dentro de um container postgres:18 com age (comando em apoio/container.ts).
let c: ContainerAge;
let chave = '';
const URL_OK = 'postgres://postgres:postgres@127.0.0.1:5432/origem';

beforeAll(() => {
  c = ContainerAge.iniciar();
  c.copiarPara(SCRIPT_DUMP, '/dump-cifrado.sh');
  chave = c.gerarChave();
  c.criarBancoComGrupos('origem');
}, 300_000);

afterAll(() => c?.parar());

function arquivosEm(dir: string): string[] {
  return c
    .sh(`ls -A ${dir}`)
    .saida.split('\n')
    .filter((l) => l.trim() !== '');
}

function dump(dir: string, env: Record<string, string>) {
  c.sh(`rm -rf ${dir} && mkdir ${dir}`);
  return c.sh('bash /dump-cifrado.sh', env);
}

describe('dump-cifrado.sh', () => {
  it('FUN-47: dump de um banco com 2 grupos, decifrado, passa em pg_restore --list', () => {
    const r = dump('/s1', { PG_URL: URL_OK, CHAVE_PUBLICA: chave, SAIDA: '/s1/backup.age' });
    expect(r.codigo, r.erro).toBe(0);
    expect(arquivosEm('/s1')).toEqual(['backup.age']);
    const lista = c.sh('age -d -i /chave.txt /s1/backup.age | pg_restore --list');
    expect(lista.codigo, lista.erro).toBe(0);
    expect(lista.saida).toMatch(/TABLE DATA public grupos/);
    expect(lista.saida).toMatch(/TABLE DATA public jogadores/);
  });

  it('FUN-47: o arquivo final está cifrado com age', () => {
    dump('/s2', { PG_URL: URL_OK, CHAVE_PUBLICA: chave, SAIDA: '/s2/b.age' });
    expect(c.sh('head -c 21 /s2/b.age').saida).toBe('age-encryption.org/v1');
  });

  it('FUN-49: URL inválida sai com código != 0 e não deixa arquivo', () => {
    const r = dump('/s3', {
      PG_URL: 'postgres://postgres:postgres@127.0.0.1:5432/nao_existe',
      CHAVE_PUBLICA: chave,
      SAIDA: '/s3/backup.age',
    });
    expect(r.codigo).not.toBe(0);
    expect(arquivosEm('/s3')).toEqual([]);
  });

  it('FUN-49: chave pública inválida sai com código != 0 e não deixa arquivo parcial', () => {
    const r = dump('/s4', { PG_URL: URL_OK, CHAVE_PUBLICA: 'age1invalida', SAIDA: '/s4/backup.age' });
    expect(r.codigo).not.toBe(0);
    expect(arquivosEm('/s4')).toEqual([]);
  });

  it('FUN-49: sem a chave definida, falha antes do dump', () => {
    const r = dump('/s5', { PG_URL: URL_OK, SAIDA: '/s5/backup.age' });
    expect(r.codigo).not.toBe(0);
    expect(arquivosEm('/s5')).toEqual([]);
  });
});
