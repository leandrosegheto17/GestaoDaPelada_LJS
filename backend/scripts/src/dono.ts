import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { comConexao, executarCli } from './conectar.ts';
import { exigirHostPermitido, HOSTS_LOCAIS } from './host.ts';

/**
 * `pnpm --filter @pelada/scripts dono -- --email <e-mail> [--alvo local|previa|producao]`
 * (ACE-61, ACE-62, AD-024): cria a conta do dono ou troca a senha dela por
 * `conta_definir_senha(email, senha, true)`, que só a role de migração executa (AD-008).
 *
 * - A senha é pedida no terminal sem eco, duas vezes, e nunca é mostrada nem logada.
 * - Alvos: `local` (padrão, `DATABASE_URL_MIGRACAO`, só host local); `previa` (branch `dev`
 *   do Neon, `NEON_URL_DEV_MIGRACAO`); `producao` (`main` do Neon, `NEON_URL_MIGRACAO`), este só
 *   depois de o usuário digitar o e-mail do dono e a palavra `producao` (AD-024).
 * - Banco remoto sem `--alvo` explícito: recusa antes de conectar (ACE-62).
 *
 * O e-mail do dono é fixado no banco pelo CHECK `contas_dono_email`; outro e-mail falha lá.
 */

export class ErroDono extends Error {
  override name = 'ErroDono';
}

export const ALVOS = ['local', 'previa', 'producao'] as const;
export type Alvo = (typeof ALVOS)[number];

/** Mesmos limites da senha nova do contrato (`@pelada/contrato/primitivos`, ACE-03, ACE-68). */
const SENHA_MIN = 8;
const SENHA_MAX = 72;
const SENHA_MAX_BYTES = 72;

export interface OpcoesDono {
  email: string;
  alvo: Alvo;
}

/** Entrada e saída do terminal; o teste injeta um dublê. */
export interface Terminal {
  /** Lê uma linha sem eco. */
  senha(pergunta: string): Promise<string>;
  /** Lê uma linha com eco. */
  linha(pergunta: string): Promise<string>;
  escrever(mensagem: string): void;
}

export interface ResultadoDono {
  contaId: string;
  alvo: Alvo;
}

const USO =
  'Uso: pnpm --filter @pelada/scripts dono -- --email <e-mail> [--alvo local|previa|producao]';

function valorDe(argv: readonly string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new ErroDono(USO);
  return v;
}

export function lerArgumentos(argv: readonly string[]): OpcoesDono {
  const email = valorDe(argv, '--email')?.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new ErroDono(USO);
  const alvo = valorDe(argv, '--alvo') ?? 'local';
  if (!(ALVOS as readonly string[]).includes(alvo)) throw new ErroDono(USO);
  return { email, alvo: alvo as Alvo };
}

/**
 * URL do alvo. `local` passa pela trava de host antes de qualquer conexão (ACE-62): uma URL
 * remota em `DATABASE_URL_MIGRACAO` sem `--alvo` explícito é recusada. Os alvos remotos só
 * existem por escolha explícita.
 */
export function urlDoAlvo(alvo: Alvo, env: Record<string, string | undefined>): string {
  if (alvo === 'local') {
    const url = env.DATABASE_URL_MIGRACAO;
    if (!url) throw new ErroDono('DATABASE_URL_MIGRACAO não definida (veja o .env.example).');
    exigirHostPermitido(url, HOSTS_LOCAIS);
    return url;
  }
  const nome = alvo === 'previa' ? 'NEON_URL_DEV_MIGRACAO' : 'NEON_URL_MIGRACAO';
  const url = env[nome];
  if (!url) throw new ErroDono(`${nome} não definida (veja o .env.example).`);
  return url;
}

/** Confirmação digitada do alvo `producao` (AD-024): o e-mail do dono e a palavra `producao`. */
async function confirmarProducao(email: string, terminal: Terminal): Promise<void> {
  terminal.escrever('Atenção: o alvo é a produção (main do Neon).');
  const digitado = (await terminal.linha('Digite o e-mail do dono para confirmar: '))
    .trim()
    .toLowerCase();
  if (digitado !== email)
    throw new ErroDono('Confirmação recusada: o e-mail digitado não confere. Nada mudou.');
  const palavra = (await terminal.linha('Digite producao para confirmar: ')).trim();
  if (palavra !== 'producao')
    throw new ErroDono('Confirmação recusada: digite exatamente producao. Nada mudou.');
}

/** Valida a senha nova; a mensagem nunca traz a senha. */
export function validarSenha(senha: string): void {
  const bytes = new TextEncoder().encode(senha).length;
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX || bytes > SENHA_MAX_BYTES) {
    throw new ErroDono(
      `A senha precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres (até ${SENHA_MAX_BYTES} bytes).`,
    );
  }
}

async function lerSenha(terminal: Terminal): Promise<string> {
  const senha = await terminal.senha('Senha nova do dono: ');
  validarSenha(senha);
  const repetida = await terminal.senha('Repita a senha: ');
  if (repetida !== senha) throw new ErroDono('As senhas não conferem. Nada mudou.');
  return senha;
}

export async function comandoDono(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  terminal: Terminal,
): Promise<ResultadoDono> {
  const opcoes = lerArgumentos(argv);
  // Tudo o que pode recusar vem antes da conexão (ACE-62): alvo, trava de host, confirmação e senha.
  const url = urlDoAlvo(opcoes.alvo, env);
  if (opcoes.alvo === 'producao') await confirmarProducao(opcoes.email, terminal);
  const senha = await lerSenha(terminal);

  const contaId = await comConexao(url, async (c) => {
    const r = await c.query<{ id: string }>('SELECT conta_definir_senha($1, $2, true) AS id', [
      opcoes.email,
      senha,
    ]);
    const id = r.rows[0]?.id;
    if (!id) throw new ErroDono('conta_definir_senha não devolveu a conta.');
    return id;
  });
  terminal.escrever(
    `Senha do dono definida no alvo ${opcoes.alvo} (conta ${contaId}). As sessões dela foram encerradas.`,
  );
  return { contaId, alvo: opcoes.alvo };
}

/** Lê uma linha do terminal sem mostrar o que se digita (o eco é engolido depois da pergunta). */
async function perguntar(pergunta: string, oculto: boolean): Promise<string> {
  let mudo = false;
  const saida = new Writable({
    write(pedaco, codificacao, feito) {
      if (!mudo) process.stdout.write(pedaco, codificacao);
      feito();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: saida,
    terminal: process.stdin.isTTY === true,
  });
  try {
    const resposta = rl.question(pergunta);
    // A pergunta já foi escrita de forma síncrona; daqui em diante o eco some.
    mudo = oculto;
    const r = await resposta;
    if (oculto) process.stdout.write('\n');
    return r;
  } finally {
    rl.close();
  }
}

export const terminalReal: Terminal = {
  senha: (p) => perguntar(p, true),
  linha: (p) => perguntar(p, false),
  escrever: (m) => console.log(m),
};

if (import.meta.main) {
  await executarCli(async () => {
    await comandoDono(process.argv.slice(2), process.env, terminalReal);
  });
}
