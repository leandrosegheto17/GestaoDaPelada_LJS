import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import pacote from '../../../package.json' with { type: 'json' };
import { ambienteDoDev, VARIAVEL_HYPERDRIVE } from '../dev/ambiente.ts';

const raiz = resolve(import.meta.dirname, '../../..');
const LOCAL = 'postgres://postgres:postgres@localhost:5432/pelada';

function rodarDev(env: Record<string, string | undefined>) {
  const ambiente: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const [chave, valor] of Object.entries(env)) if (valor === undefined) delete ambiente[chave];
  return spawnSync(process.execPath, ['backend/scripts/dev.ts'], {
    cwd: raiz,
    env: ambiente,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

async function portaFechada(): Promise<number> {
  const servidor = createServer();
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = (servidor.address() as { port: number }).port;
  await new Promise((ok) => servidor.close(ok));
  return porta;
}

describe('pnpm dev (FUN-04)', () => {
  it('o script dev da raiz roda backend/scripts/dev.ts com o .env', () => {
    expect(pacote.scripts.dev).toBe('node --env-file-if-exists=.env backend/scripts/dev.ts');
  });

  describe('ambiente do wrangler dev e do Vite', () => {
    it('o Hyperdrive local aponta para o Postgres local como pelada_app, com a senha do .env', () => {
      const env = ambienteDoDev({ DATABASE_URL: LOCAL, PELADA_APP_SENHA: 'senha-local' });
      const url = new URL(env[VARIAVEL_HYPERDRIVE]);
      expect(VARIAVEL_HYPERDRIVE).toBe('CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE');
      expect(url.username).toBe('pelada_app');
      expect(url.password).toBe('senha-local');
      expect(url.hostname).toBe('127.0.0.1');
      expect(url.port).toBe('5432');
      expect(url.pathname).toBe('/pelada');
    });

    it('senha com caracteres especiais vai codificada e volta igual', () => {
      const senha = 'a@b:c/d?e#f%g';
      const url = new URL(ambienteDoDev({ DATABASE_URL: LOCAL, PELADA_APP_SENHA: senha })[VARIAVEL_HYPERDRIVE]);
      expect(decodeURIComponent(url.password)).toBe(senha);
      expect(url.hostname).toBe('127.0.0.1');
    });

    it('o Vite faz proxy para o Worker local e o .env não vira segredo do Worker', () => {
      const env = ambienteDoDev({ DATABASE_URL: LOCAL, PELADA_APP_SENHA: 'x' });
      expect(env.ALVO_API_DEV).toBe('http://localhost:8787');
      expect(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV).toBe('false');
    });

    it('recusa host remoto antes de qualquer coisa', () => {
      expect(() =>
        ambienteDoDev({
          DATABASE_URL: 'postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/neondb',
          PELADA_APP_SENHA: 'x',
        }),
      ).toThrow(/só roda com o banco local/);
    });

    it('sem PELADA_APP_SENHA, pede para definir e rodar o seed', () => {
      expect(() => ambienteDoDev({ DATABASE_URL: LOCAL })).toThrow(/PELADA_APP_SENHA.*pnpm seed/);
      expect(() => ambienteDoDev({ DATABASE_URL: LOCAL, PELADA_APP_SENHA: '' })).toThrow(/PELADA_APP_SENHA/);
    });
  });

  it('o localConnectionString do wrangler.jsonc aponta para o Postgres do docker-compose', () => {
    const { config } = ts.parseConfigFileTextToJson(
      'wrangler.jsonc',
      readFileSync(resolve(raiz, 'wrangler.jsonc'), 'utf8'),
    );
    const local = new URL(
      (config as { hyperdrive: { localConnectionString: string }[] }).hyperdrive[0]!.localConnectionString,
    );
    const compose = yaml.load(readFileSync(resolve(raiz, 'docker-compose.yml'), 'utf8')) as {
      services: { db: { ports: string[]; environment: { POSTGRES_DB: string } } };
    };
    const portaDoCompose = compose.services.db.ports[0]!.split(':').at(-2);
    expect(local.hostname).toBe('localhost');
    expect(local.port || '5432').toBe(portaDoCompose);
    expect(local.pathname).toBe(`/${compose.services.db.environment.POSTGRES_DB}`);
    expect(local.username).toBe('pelada_app');
  });

  it('com o banco local fora do ar, falha dizendo para rodar `docker compose up -d`, sem subir nada (FUN-53)', async () => {
    const r = rodarDev({
      DATABASE_URL: `postgres://u:segredo@127.0.0.1:${await portaFechada()}/pelada`,
      PELADA_APP_SENHA: 'outro-segredo',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Rode `docker compose up -d`');
    expect(r.stderr + r.stdout).not.toMatch(/segredo/);
    expect(r.stdout).not.toMatch(/wrangler|vite/i);
  });

  it('com host remoto, recusa sem conectar e sem vazar a senha', () => {
    const r = rodarDev({
      DATABASE_URL: 'postgres://u:segredo@ep-x.sa-east-1.aws.neon.tech/neondb',
      PELADA_APP_SENHA: 'x',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('segredo');
  });
});
