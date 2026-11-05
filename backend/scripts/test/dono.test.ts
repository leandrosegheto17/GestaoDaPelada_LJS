import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { comandoDono, lerArgumentos, type Terminal } from '../src/dono.ts';
import { comBancoMigrado, entrarComo } from './apoio/banco.ts';

/** O CHECK `contas_dono_email` (linha de base) só aceita este e-mail com `e_dono`. */
const EMAIL_DONO = 'leandrosegheto17@gmail.com';
const REMOTO = 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb';

/** Dublê do terminal: respostas em fila e tudo o que foi escrito. */
function terminal(respostas: { senhas?: string[]; linhas?: string[] } = {}) {
  const senhas = [...(respostas.senhas ?? [])];
  const linhas = [...(respostas.linhas ?? [])];
  const escrito: string[] = [];
  const t: Terminal & { escrito: string[]; perguntasSenha: number } = {
    escrito,
    perguntasSenha: 0,
    senha: async (p) => {
      escrito.push(p);
      t.perguntasSenha++;
      const s = senhas.shift();
      if (s === undefined) throw new Error('dublê: senha não esperada');
      return s;
    },
    linha: async (p) => {
      escrito.push(p);
      const l = linhas.shift();
      if (l === undefined) throw new Error('dublê: linha não esperada');
      return l;
    },
    escrever: (m) => escrito.push(m),
  };
  return t;
}

function novaSenha(): string {
  return `dono-${randomBytes(8).toString('hex')}`;
}

let logs: string[];
let espioes: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  logs = [];
  espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    }),
  );
});

afterEach(() => {
  for (const e of espioes) e.mockRestore();
});

describe('script do dono: argumentos', () => {
  it('ACE-61: --email é obrigatório; o alvo padrão é local; alvo desconhecido é recusado', () => {
    expect(() => lerArgumentos([])).toThrow(/--email/);
    expect(() => lerArgumentos(['--email'])).toThrow(/--email/);
    expect(lerArgumentos(['--email', ' Leandrosegheto17@Gmail.com '])).toEqual({
      email: EMAIL_DONO,
      alvo: 'local',
    });
    expect(lerArgumentos(['--email', EMAIL_DONO, '--alvo', 'previa'])).toEqual({
      email: EMAIL_DONO,
      alvo: 'previa',
    });
    expect(() => lerArgumentos(['--email', EMAIL_DONO, '--alvo', 'main'])).toThrow(/--alvo/);
    expect(() => lerArgumentos(['--email', EMAIL_DONO, '--alvo'])).toThrow(/--alvo/);
  });
});

describe('script do dono: no banco de teste', () => {
  it('ACE-61: cria o dono, e rodar de novo troca a senha; a conta entra por conta_entrar; a senha não aparece na saída nem no log', async () => {
    await comBancoMigrado(async (url) => {
      const env = { DATABASE_URL_MIGRACAO: url };
      const primeira = novaSenha();
      const t1 = terminal({ senhas: [primeira, primeira] });
      const r1 = await comandoDono(['--email', EMAIL_DONO], env, t1);
      expect(r1.alvo).toBe('local');

      const conta = await comConexao(
        url,
        async (c) =>
          (
            await c.query<{ id: string; e_dono: boolean; confirmada: boolean }>(
              'SELECT id, e_dono, email_confirmado_em IS NOT NULL AS confirmada FROM contas WHERE email = $1',
              [EMAIL_DONO],
            )
          ).rows,
      );
      expect(conta).toEqual([{ id: r1.contaId, e_dono: true, confirmada: true }]);
      expect(await entrarComo(url, EMAIL_DONO, primeira)).toBe('ok');

      const segunda = novaSenha();
      const t2 = terminal({ senhas: [segunda, segunda] });
      const r2 = await comandoDono(['--email', EMAIL_DONO], env, t2);
      expect(r2.contaId).toBe(r1.contaId);
      expect(await entrarComo(url, EMAIL_DONO, segunda)).toBe('ok');
      expect(await entrarComo(url, EMAIL_DONO, primeira)).toBe('invalida');
      // A troca encerra as sessões da conta: depois do segundo run, só a sessão do último entrar.
      const sessoes = await comConexao(
        url,
        async (c) =>
          (
            await c.query<{ n: number }>(
              'SELECT count(*)::int AS n FROM sessoes WHERE conta_id = $1',
              [r1.contaId],
            )
          ).rows[0]?.n,
      );
      expect(sessoes).toBe(1);

      const tudo = [...t1.escrito, ...t2.escrito, ...logs].join('\n');
      expect(tudo).not.toContain(primeira);
      expect(tudo).not.toContain(segunda);
      expect(t1.escrito.join('\n')).toMatch(/Senha do dono definida/);
    });
  });

  it('ACE-61: senhas que não conferem ou fora dos limites saem com erro sem tocar no banco', async () => {
    await comBancoMigrado(async (url) => {
      const env = { DATABASE_URL_MIGRACAO: url };
      const senha = novaSenha();
      await expect(
        comandoDono(['--email', EMAIL_DONO], env, terminal({ senhas: [senha, `${senha}x`] })),
      ).rejects.toThrow(/não conferem/);
      await expect(
        comandoDono(['--email', EMAIL_DONO], env, terminal({ senhas: ['curta'] })),
      ).rejects.toThrow(/8 a 72/);
      await expect(
        comandoDono(['--email', EMAIL_DONO], env, terminal({ senhas: ['é'.repeat(40)] })),
      ).rejects.toThrow(/72 bytes/);
      const n = await comConexao(
        url,
        async (c) =>
          (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM contas')).rows[0]?.n,
      );
      expect(n).toBe(0);
      expect(logs.join('\n')).not.toContain(senha);
    });
  });
});

describe('script do dono: travas antes de conectar', () => {
  let conectar: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    conectar = vi.spyOn(pg.Client.prototype, 'connect');
  });
  afterEach(() => conectar.mockRestore());

  it('ACE-62: URL remota sem --alvo sai com erro antes de conectar e sem pedir a senha', async () => {
    const t = terminal({ senhas: ['qualquer-senha', 'qualquer-senha'] });
    await expect(
      comandoDono(['--email', EMAIL_DONO], { DATABASE_URL_MIGRACAO: REMOTO }, t),
    ).rejects.toThrow(/não permitido/);
    // Nem a permissão de host remoto da migração libera o alvo local.
    await expect(
      comandoDono(
        ['--email', EMAIL_DONO],
        { DATABASE_URL_MIGRACAO: REMOTO, PELADA_PERMITIR_HOST_REMOTO: '1' },
        t,
      ),
    ).rejects.toThrow(/não permitido/);
    await expect(
      comandoDono(['--email', EMAIL_DONO, '--alvo', 'local'], { DATABASE_URL_MIGRACAO: REMOTO }, t),
    ).rejects.toThrow(/não permitido/);
    expect(t.perguntasSenha).toBe(0);
    expect(conectar).not.toHaveBeenCalled();
  });

  it('ACE-62: alvo sem a URL dele sai com a orientação, sem conectar', async () => {
    await expect(comandoDono(['--email', EMAIL_DONO], {}, terminal())).rejects.toThrow(
      /DATABASE_URL_MIGRACAO/,
    );
    await expect(
      comandoDono(['--email', EMAIL_DONO, '--alvo', 'previa'], {}, terminal()),
    ).rejects.toThrow(/NEON_URL_DEV_MIGRACAO/);
    await expect(
      comandoDono(['--email', EMAIL_DONO, '--alvo', 'producao'], {}, terminal()),
    ).rejects.toThrow(/NEON_URL_MIGRACAO/);
    expect(conectar).not.toHaveBeenCalled();
  });

  it('ACE-62: --alvo producao sem a confirmação digitada correta sai com erro antes de conectar (AD-024)', async () => {
    const env = { NEON_URL_MIGRACAO: REMOTO };
    const argv = ['--email', EMAIL_DONO, '--alvo', 'producao'];

    const emailErrado = terminal({
      linhas: ['outro@exemplo.test', 'producao'],
      senhas: ['x'.repeat(10), 'x'.repeat(10)],
    });
    await expect(comandoDono(argv, env, emailErrado)).rejects.toThrow(
      /e-mail digitado não confere/,
    );
    expect(emailErrado.perguntasSenha).toBe(0);

    const palavraErrada = terminal({
      linhas: [EMAIL_DONO, 'Produção'],
      senhas: ['x'.repeat(10), 'x'.repeat(10)],
    });
    await expect(comandoDono(argv, env, palavraErrada)).rejects.toThrow(
      /digite exatamente producao/,
    );
    expect(palavraErrada.perguntasSenha).toBe(0);

    const vazia = terminal({ linhas: ['', ''] });
    await expect(comandoDono(argv, env, vazia)).rejects.toThrow(/não confere/);

    expect(conectar).not.toHaveBeenCalled();
  });
});
