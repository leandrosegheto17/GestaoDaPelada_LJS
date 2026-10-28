import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Critérios: FUN-46 e FUN-47 (tasks.md, T40). O script roda de verdade em bash, com `docker` e `age` falsos no PATH.
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT = join(RAIZ, '.github/actions/dump-cifrado/dump-cifrado.sh');
const lerYaml = (caminho) => yaml.load(readFileSync(join(RAIZ, caminho), 'utf8'));

let pasta;
beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'dump-'));
  mkdirSync(join(pasta, 'bin'));
});
afterEach(() => rmSync(pasta, { recursive: true, force: true }));

const falso = (nome, corpo) => {
  const arquivo = join(pasta, 'bin', nome);
  writeFileSync(arquivo, `#!/usr/bin/env bash\n${corpo}\n`);
  chmodSync(arquivo, 0o755);
};

/** `docker` falso: registra os argumentos; `pgdump` decide o que o dump produz. `age` falso copia stdin para -o. */
function rodar({
  docker = 'echo DUMP-BINARIO',
  age = 'while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done; cat > "$out"',
} = {}) {
  falso('docker', `echo "$@" >> "${join(pasta, 'docker.log')}"\n${docker}`);
  falso('age', age);
  const saida = join(pasta, 'dump.sql.age');
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${join(pasta, 'bin')}${delimiter}${process.env.PATH}`,
      PG_URL: 'postgres://usuario:segredo@host-secreto.exemplo/banco',
      CHAVE_AGE: 'age1chavepublicaficticia',
      SAIDA: saida,
    },
  });
  return { ...r, saida, arquivos: readdirSync(pasta).filter((n) => n.startsWith('dump')) };
}

describe('dump-cifrado.sh (FUN-46, FUN-47)', () => {
  it('gera o dump com pg_dump -Fc e --enable-row-security no cliente do PostgreSQL 18 (ADR-031)', () => {
    const r = rodar();
    expect(r.status).toBe(0);
    const chamada = readFileSync(join(pasta, 'docker.log'), 'utf8');
    expect(chamada).toContain('postgres:18');
    expect(chamada).toContain('--format=custom');
    expect(chamada).toContain('--enable-row-security');
    expect(readFileSync(r.saida, 'utf8')).toContain('DUMP-BINARIO');
  });

  // Motivo da mudança (ADR-034, aprovado pelo usuário): a imagem vai pela tag oficial postgres:18, sem digest.
  it('o cliente é a imagem oficial pela tag exata postgres:18 (ADR-034)', () => {
    expect(rodar().status).toBe(0);
    const chamada = readFileSync(join(pasta, 'docker.log'), 'utf8');
    expect(chamada).toMatch(/(^|\s)postgres:18\s/);
  });

  it('falha de pg_dump falha o job e não deixa artefato, nem parcial', () => {
    const r = rodar({ docker: 'echo "erro com host-secreto" >&2; echo PARCIAL; exit 3' });
    expect(r.status).not.toBe(0);
    expect(existsSync(r.saida)).toBe(false);
    expect(r.arquivos).toEqual([]);
  });

  it('falha de age falha o job e não deixa artefato, nem parcial', () => {
    const r = rodar({ age: 'echo "meio" > "$4"; exit 1' });
    expect(r.status).not.toBe(0);
    expect(existsSync(r.saida)).toBe(false);
    expect(r.arquivos).toEqual([]);
  });

  it('dump vazio também falha', () => {
    const r = rodar({ docker: 'true' });
    expect(r.status).not.toBe(0);
    expect(r.arquivos).toEqual([]);
  });

  it('não vaza a URL, a senha nem o host nas mensagens', () => {
    const r = rodar({ docker: 'echo "erro host-secreto segredo" >&2; exit 3' });
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/segredo|host-secreto/);
  });

  it('recusa chave que não é o destinatário público age', () => {
    falso('docker', 'true');
    const r = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, PG_URL: 'x', CHAVE_AGE: 'AGE-SECRET-KEY-1abc', SAIDA: join(pasta, 'o') },
    });
    expect(r.status).not.toBe(0);
  });
});

describe('backup.yml e a action (FUN-46)', () => {
  const documento = lerYaml('.github/workflows/backup.yml');
  const passos = documento.jobs.backup.steps;

  it('agenda 07:00 UTC todo dia e aceita disparo manual', () => {
    expect(documento.on.schedule).toEqual([{ cron: '0 7 * * *' }]);
    expect(documento.on).toHaveProperty('workflow_dispatch');
  });

  it('usa a role de backup, a chave pública e 30 dias de retenção', () => {
    const dump = passos.find((p) => p.uses === './.github/actions/dump-cifrado');
    expect(dump.with.url).toBe('${{ secrets.NEON_URL_BACKUP }}');
    expect(dump.with.chave).toBe('${{ secrets.BACKUP_CHAVE }}');
    expect(dump.with.retencao).toBe('30');
    const acao = lerYaml('.github/actions/dump-cifrado/action.yml');
    expect(acao.inputs.retencao.default).toBe('30');
    const envio = acao.runs.steps.find((p) => p.uses?.startsWith('actions/upload-artifact@'));
    expect(envio.with['retention-days']).toBe('${{ inputs.retencao }}');
    expect(envio.with['if-no-files-found']).toBe('error');
  });

  it('nenhum passo ignora erro, então dump ou cifragem que falha deixa o job vermelho', () => {
    expect(JSON.stringify(documento)).not.toContain('continue-on-error');
    expect(JSON.stringify(lerYaml('.github/actions/dump-cifrado/action.yml'))).not.toContain('continue-on-error');
    expect(passos.every((p) => p.if === undefined)).toBe(true);
  });

  // ADR-032: a URL do Neon passa pela validação única antes de qualquer conexão do pg_dump.
  it('a action confere a URL do Neon antes do dump, com o papel recebido', () => {
    const acao = lerYaml('.github/actions/dump-cifrado/action.yml');
    expect(acao.inputs.papel.required).toBe(true);
    const passosAcao = acao.runs.steps;
    const conferir = passosAcao.findIndex((p) => p.run?.includes('conferir-url-neon-cli.ts'));
    const dump = passosAcao.findIndex((p) => p.run?.includes('dump-cifrado.sh'));
    expect(conferir).toBeGreaterThanOrEqual(0);
    expect(conferir).toBeLessThan(dump);
    const passo = passosAcao[conferir];
    expect(passo.env.PG_URL).toBe('${{ inputs.url }}');
    expect(passo.run).toContain('--papel "$PAPEL" --executar');
    expect(passo.run).not.toContain('inputs.url');
    expect(passosAcao.slice(0, conferir).some((p) => p.uses?.startsWith('actions/setup-node@'))).toBe(true);
  });

  it('o backup usa o papel backup e o deploy o papel owner', () => {
    const dump = passos.find((p) => p.uses === './.github/actions/dump-cifrado');
    expect(dump.with.papel).toBe('backup');
    const deploy = lerYaml('.github/workflows/deploy.yml').jobs.deploy.steps;
    expect(deploy.find((p) => p.uses === './.github/actions/dump-cifrado').with.papel).toBe('owner');
  });

  it('não corre em paralelo consigo mesmo nem cancela o anterior', () => {
    expect(documento.concurrency['cancel-in-progress']).toBe(false);
  });
});
