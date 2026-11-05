import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { lerEsquema, type OpcoesLerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { bancoDeTeste, comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';

const URL_BASE = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;

const mini = (role: string) => `
  CREATE TABLE t (id int PRIMARY KEY, grupo_id int, nome text);
  ALTER TABLE t ENABLE ROW LEVEL SECURITY;
  CREATE POLICY t_ler ON t FOR SELECT TO ${role} USING (grupo_id = 1);
  CREATE FUNCTION f() RETURNS int LANGUAGE sql STABLE AS $$ SELECT 1 $$;
  GRANT SELECT ON t TO ${role};
`;

/**
 * Cria uma role pelada_* descartável (roles são do cluster), monta o mini schema,
 * lê o esquema antes e depois da mudança e devolve as linhas que mudaram.
 * A role sai no finally, depois do banco.
 */
async function mudancas(
  ddl: (role: string) => string,
  opcoes: OpcoesLerEsquema = {},
): Promise<string[]> {
  const role = `pelada_t20_${randomBytes(4).toString('hex')}`;
  await comCliente(URL_BASE, (c) => c.query(`CREATE ROLE ${role} NOLOGIN`));
  try {
    return await bancoDeTeste(async (url) => {
      await comCliente(url, (c) => c.query(mini(role)));
      const antes = await comCliente(url, (c) => lerEsquema(c, opcoes));
      await comCliente(url, (c) => c.query(ddl(role)));
      const depois = await comCliente(url, (c) => lerEsquema(c, opcoes));
      return [
        ...antes.filter((l) => !depois.includes(l)).map((l) => `- ${l}`),
        ...depois.filter((l) => !antes.includes(l)).map((l) => `+ ${l}`),
      ];
    });
  } finally {
    await comCliente(URL_BASE, (c) => c.query(`DROP ROLE IF EXISTS ${role}`));
  }
}

function mudouCategoria(linhas: string[], prefixo: RegExp): boolean {
  return linhas.length > 0 && linhas.every((l) => prefixo.test(l.slice(2)));
}

describe('lerEsquema: funções, policies, grants e roles', () => {
  it('FUN-08: mudar o corpo de uma função muda a saída', async () => {
    const m = await mudancas(
      () => 'CREATE OR REPLACE FUNCTION f() RETURNS int LANGUAGE sql STABLE AS $$ SELECT 2 $$',
    );
    expect(mudouCategoria(m, /^funcao f\(\)/), m.join('\n')).toBe(true);
  });

  it('FUN-08: mudar o search_path de uma função muda a saída', async () => {
    const m = await mudancas(() => 'ALTER FUNCTION f() SET search_path = public, pg_temp');
    expect(mudouCategoria(m, /^funcao f\(\)/), m.join('\n')).toBe(true);
    expect(m.some((l) => l.startsWith('+ ') && l.includes('search_path=public, pg_temp'))).toBe(true);
  });

  it('FUN-08: tornar a função SECURITY DEFINER muda a saída', async () => {
    const m = await mudancas(() => 'ALTER FUNCTION f() SECURITY DEFINER');
    expect(m.some((l) => l.startsWith('+ ') && l.includes('security definer'))).toBe(true);
  });

  it('FUN-08: revogar o EXECUTE do PUBLIC numa função muda a saída', async () => {
    const m = await mudancas(() => 'REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC');
    expect(m).toEqual(['- grant funcao f() PUBLIC EXECUTE']);
  });

  it('FUN-08: mudar o USING de uma policy muda a saída', async () => {
    const m = await mudancas(() => 'ALTER POLICY t_ler ON t USING (grupo_id = 2)');
    expect(mudouCategoria(m, /^policy t\.t_ler /), m.join('\n')).toBe(true);
  });

  it('FUN-08: policy nova com WITH CHECK aparece na saída', async () => {
    const m = await mudancas(
      (r) => `CREATE POLICY t_inserir ON t FOR INSERT TO ${r} WITH CHECK (grupo_id = 1)`,
    );
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^\+ policy t\.t_inserir INSERT PERMISSIVE roles=pelada_t20_\w+ using= check=/);
  });

  it('FUN-08: ligar o FORCE muda a saída', async () => {
    const m = await mudancas(() => 'ALTER TABLE t FORCE ROW LEVEL SECURITY');
    expect(m).toEqual(['- rls t enable=true force=false', '+ rls t enable=true force=true']);
  });

  it('FUN-08: um GRANT de tabela muda a saída', async () => {
    const m = await mudancas((r) => `GRANT INSERT ON t TO ${r}`);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^\+ grant tabela t pelada_t20_\w+ INSERT$/);
  });

  it('FUN-08: um GRANT de coluna muda a saída', async () => {
    const m = await mudancas((r) => `GRANT UPDATE (nome) ON t TO ${r}`);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^\+ grant coluna t\.nome pelada_t20_\w+ UPDATE$/);
  });

  it('FUN-08: um GRANT no schema public muda a saída', async () => {
    const m = await mudancas((r) => `GRANT CREATE ON SCHEMA public TO ${r}`);
    expect(m.some((l) => /^\+ grant schema public pelada_t20_\w+ CREATE$/.test(l))).toBe(true);
  });

  it('FUN-08: mudar BYPASSRLS de uma role muda a saída', async () => {
    const m = await mudancas((r) => `ALTER ROLE ${r} BYPASSRLS`);
    expect(mudouCategoria(m, /^role pelada_t20_/), m.join('\n')).toBe(true);
  });

  it('FUN-08: mudar LOGIN de uma role muda a saída', async () => {
    const m = await mudancas((r) => `ALTER ROLE ${r} LOGIN`);
    expect(mudouCategoria(m, /^role pelada_t20_/), m.join('\n')).toBe(true);
  });

  it('FUN-08: mudar só a senha de uma role não muda a saída', async () => {
    const m = await mudancas((r) => `ALTER ROLE ${r} PASSWORD 'outra-senha-${randomBytes(4).toString('hex')}'`);
    expect(m).toEqual([]);
  });

  it('FUN-08: com ignorarLogin, só o LOGIN não muda a saída', async () => {
    const m = await mudancas((r) => `ALTER ROLE ${r} LOGIN`, { ignorarLogin: true });
    expect(m).toEqual([]);
  });

  it('FUN-08: uma extensão nova aparece, sem as funções dela', async () => {
    const m = await mudancas(() => 'CREATE EXTENSION IF NOT EXISTS pgcrypto');
    expect(m).toEqual(['+ extensao pgcrypto']);
  });
});
