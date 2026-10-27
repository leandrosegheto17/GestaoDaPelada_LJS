import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente, criarBancoTemporario, type BancoTemporario } from '../../api/test/apoio/banco.ts';
import { migrar } from '../../api/src/infraestrutura/db/migracoes/migrar.ts';

const raiz = resolve(import.meta.dirname, '../../..');
const EMAIL = 'leandrosegheto17@gmail.com';

process.env['DATABASE_URL_TESTE'] ??= 'postgres://postgres:postgres@localhost:5432/pelada_teste';

let banco: BancoTemporario;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
});
afterAll(async () => {
  await banco.remover();
});

function rodar(url: string, entrada: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  delete env['CI'];
  return spawnSync(process.execPath, ['backend/scripts/dono.ts', ...args], {
    cwd: raiz,
    env,
    input: entrada,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

const confere = (senha: string) =>
  comCliente(banco.url, async (c) => {
    const { rows } = await c.query<{ ok: boolean; e_dono: boolean; confirmada: boolean; n: number }>(
      `SELECT senha_hash = crypt($2, senha_hash) AS ok, e_dono, email_confirmado_em IS NOT NULL AS confirmada,
              (SELECT count(*)::int FROM contas) AS n
         FROM contas WHERE email = $1`,
      [EMAIL, senha],
    );
    return rows[0];
  });

describe('pnpm dono', () => {
  it('cria a conta do dono; a segunda execução troca a senha, sem mostrar a senha (ACE-61)', async () => {
    const primeira = rodar(banco.url, 'senha-dono-um\n', '--email', EMAIL);
    expect(primeira.status).toBe(0);
    expect(await confere('senha-dono-um')).toEqual({ ok: true, e_dono: true, confirmada: true, n: 1 });

    const segunda = rodar(banco.url, 'senha-dono-dois\n', '--email', EMAIL);
    expect(segunda.status).toBe(0);
    expect(await confere('senha-dono-dois')).toEqual({ ok: true, e_dono: true, confirmada: true, n: 1 });
    expect(await confere('senha-dono-um')).toMatchObject({ ok: false });
    for (const r of [primeira, segunda]) {
      expect(r.stdout + r.stderr).not.toContain('senha-dono-um');
      expect(r.stdout + r.stderr).not.toContain('senha-dono-dois');
    }
  });

  it('recusa senha fora dos limites sem alterar nada', async () => {
    const r = rodar(banco.url, 'curta\n', '--email', EMAIL);
    expect(r.status).toBe(1);
    expect(await confere('senha-dono-dois')).toMatchObject({ ok: true });
  });

  it('recusa host remoto sem --alvo antes de conectar (ACE-62)', () => {
    const r = rodar('postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/neondb', 'senha-dono-tres\n', '--email', EMAIL);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('informe --alvo producao ou --alvo teste');
    expect(r.stderr).not.toContain('segredo');
  });

  it('recusa sem --email', () => {
    const r = rodar(banco.url, 'senha-dono-tres\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--email');
  });
});

describe('ACE-63: nenhuma rota lê ou escreve e_dono (G-11)', () => {
  const eslint = new ESLint({ cwd: raiz });
  const regras = async (codigo: string, arquivo: string) => {
    const [r] = await eslint.lintText(codigo, { filePath: resolve(raiz, arquivo) });
    return (r?.messages ?? []).filter((m) => m.ruleId === 'pelada/sem-escrita-dono').length;
  };

  it.each([
    ['rota', 'backend/api/src/entrada/rotas/x.ts'],
    ['repositório', 'backend/api/src/infraestrutura/db/repositorios/x.ts'],
  ])('o lint barra escrita de e_dono em %s', async (_nome, arquivo) => {
    expect(await regras("const q = 'UPDATE contas SET e_dono = true';", arquivo)).toBeGreaterThan(0);
    expect(await regras('const o = { eDono: true };', arquivo)).toBeGreaterThan(0);
  });

  it('não barra a leitura de eDono', async () => {
    expect(await regras('export const f = (c: { eDono: boolean }) => c.eDono;', 'backend/api/src/x.ts')).toBe(0);
  });
});
