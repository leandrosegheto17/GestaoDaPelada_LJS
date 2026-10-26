// Critério: SEC-009 (seguranca.md) e G-16: a restauração destrutiva (`pg_restore --clean`, runbook §4) passa pela
// trava de host antes de qualquer escrita, e nunca aponta para produção.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restaurar, type OpcoesRestaurar } from '../restaurar.ts';

const script = fileURLToPath(new URL('../restaurar-cli.ts', import.meta.url));
const REMOTO = 'postgres://dono:segredo@ep-nova-123.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const PRODUCAO = 'postgres://dono:outra@ep-producao-9.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const LOCAL = 'postgres://postgres:senha-local@localhost:5432/restaurado';

let pasta: string;
let dump: string;
beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'restaurar-'));
  dump = join(pasta, 'dump.pgdump');
  writeFileSync(dump, 'PGDMP');
});
afterEach(() => rmSync(pasta, { recursive: true, force: true }));

type Chamada = { comando: string; args: string[]; env: Record<string, string> };

function opcoes(extra: Partial<OpcoesRestaurar> = {}) {
  const chamadas: Chamada[] = [];
  const base: OpcoesRestaurar = {
    url: LOCAL,
    arquivo: dump,
    executar: (comando, args, env) => {
      chamadas.push({ comando, args, env });
      return 0;
    },
    ...extra,
  };
  return { base, chamadas };
}

describe('restaurar: trava de host antes do pg_restore (SEC-009)', () => {
  it('host local: roda o pg_restore 16 com --clean --if-exists, sem dono nem privilégios', async () => {
    const { base, chamadas } = opcoes();
    await expect(restaurar(base)).resolves.toBe(0);
    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    expect(chamada?.comando).toBe('pg_restore');
    expect(chamada?.args).toEqual(
      expect.arrayContaining(['--no-owner', '--no-privileges', '--clean', '--if-exists', dump]),
    );
  });

  it('a senha não vai na linha de comando (vai em PGPASSWORD)', async () => {
    const { base, chamadas } = opcoes();
    await restaurar(base);
    const chamada = chamadas[0];
    expect(chamada?.args.join(' ')).not.toContain('senha-local');
    expect(chamada?.env['PGPASSWORD']).toBe('senha-local');
    const destino = chamada?.args[chamada.args.indexOf('-d') + 1] ?? '';
    expect(new URL(destino).hostname).toBe('localhost');
    expect(new URL(destino).pathname).toBe('/restaurado');
  });

  it('host remoto sem --alvo é recusado sem rodar nada', async () => {
    const { base, chamadas } = opcoes({ url: REMOTO });
    await expect(restaurar(base)).rejects.toThrow(/informe --alvo/);
    expect(chamadas).toEqual([]);
  });

  it('host remoto com --alvo teste exige a confirmação digitada do host', async () => {
    const recusa = opcoes({ url: REMOTO, alvo: 'teste', confirmar: () => 'outro-host' });
    await expect(restaurar(recusa.base)).rejects.toThrow(/confirmação ausente ou diferente/);
    expect(recusa.chamadas).toEqual([]);

    const aceita = opcoes({ url: REMOTO, alvo: 'teste', confirmar: () => 'ep-nova-123.sa-east-1.aws.neon.tech' });
    await expect(restaurar(aceita.base)).resolves.toBe(0);
    expect(aceita.chamadas).toHaveLength(1);
  });

  it('--alvo producao é sempre recusado, mesmo com CI=true e confirmação certa', async () => {
    const { base, chamadas } = opcoes({
      url: REMOTO,
      alvo: 'producao',
      ci: 'true',
      confirmar: () => 'ep-nova-123.sa-east-1.aws.neon.tech',
    });
    await expect(restaurar(base)).rejects.toThrow(/nunca restaure em produção/i);
    expect(chamadas).toEqual([]);
  });

  it('destino com o mesmo host da origem (URL_ORIGEM, produção) é recusado mesmo com --alvo teste confirmado', async () => {
    const { base, chamadas } = opcoes({
      url: PRODUCAO,
      alvo: 'teste',
      urlOrigem: PRODUCAO.replace('outra', 'x'),
      confirmar: () => 'ep-producao-9.sa-east-1.aws.neon.tech',
    });
    await expect(restaurar(base)).rejects.toThrow(/mesmo host da origem/);
    expect(chamadas).toEqual([]);
  });

  it('URL estranha (host na consulta, vários hosts) é recusada pela trava', async () => {
    for (const url of [
      'postgres://u:s@localhost/db?host=ep-producao-9.aws.neon.tech',
      'postgres://u:s@localhost,ep-producao-9.aws.neon.tech/db',
    ]) {
      const { base, chamadas } = opcoes({ url });
      await expect(restaurar(base)).rejects.toThrow();
      expect(chamadas).toEqual([]);
    }
  });

  it('sem arquivo, ou arquivo inexistente, falha antes de rodar', async () => {
    for (const arquivo of [undefined, join(pasta, 'nao-existe.pgdump')]) {
      const { base, chamadas } = opcoes({ arquivo });
      await expect(restaurar(base)).rejects.toThrow(/--arquivo/);
      expect(chamadas).toEqual([]);
    }
  });

  it('o código de saída do pg_restore é devolvido (erro de verdade não vira sucesso)', async () => {
    const { base } = opcoes({ executar: () => 1 });
    await expect(restaurar(base)).resolves.toBe(1);
  });

  it('as mensagens de recusa não trazem usuário nem senha da URL', async () => {
    const { base } = opcoes({ url: REMOTO });
    const erro = (await restaurar(base).catch((e: unknown) => e)) as Error;
    expect(erro.message).not.toMatch(/segredo|dono/);
  });
});

describe('restaurar-cli', () => {
  it('recusa host remoto sem --alvo antes de chamar o pg_restore, sem vazar a senha', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: REMOTO, PATH: '' };
    delete env['CI'];
    const r = spawnSync(process.execPath, [script, '--arquivo', dump], { env, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('informe --alvo producao ou --alvo teste');
    expect(r.stderr).not.toContain('segredo');
  });
});
