import { email as esquemaEmail, senha as esquemaSenha } from '../contrato/src/primitivos.ts';
import { definirSenhaDaConta } from '../api/src/infraestrutura/db/repositorios/definir-senha.ts';
import { exigirHostPermitido, HostRecusado } from '../api/src/infraestrutura/seguranca/trava-host.ts';
import { conferirAlvoNeon, urlDoAlvo } from './comum/alvo-neon.ts';
import { argumento, confirmarHost } from './comum/argumentos.ts';
import { lerSenhaSemEco } from './comum/senha.ts';

/**
 * Conta do dono da plataforma (ACE-61 a ACE-63): cria a conta de dono ou troca a senha dela.
 * Uso: pnpm dono -- --email <e-mail> [--alvo producao|teste]
 * Roda como owner (`DATABASE_URL` local, `NEON_URL_MIGRACAO` com `--alvo producao`, `NEON_URL_DEV` com `--alvo
 * teste`; ADR-032) e chama `conta_definir_senha`, que só o owner executa. A senha é pedida sem eco
 * e nunca é exibida. Host remoto sem `--alvo` é recusado antes de conectar.
 */
class Abortar extends Error {}

async function principal(): Promise<void> {
  const email = esquemaEmail.safeParse(argumento('email'));
  if (!email.success) throw new Abortar('Uso: pnpm dono -- --email <e-mail> [--alvo producao|teste]');
  const alvo = argumento('alvo');
  const url = urlDoAlvo(alvo, process.env);
  conferirAlvoNeon(url, alvo); // ADR-032: --alvo producao|teste só aceita a conexão direta do owner no Neon.
  await exigirHostPermitido({ url, alvo, ci: process.env['CI'], confirmar: confirmarHost });

  const senha = await lerSenhaSemEco('Senha nova do dono (sem eco): ');
  if (!esquemaSenha.safeParse(senha).success) {
    throw new Abortar('A senha precisa ter de 8 a 72 caracteres (no máximo 72 bytes).');
  }

  await definirSenhaDaConta(url as string, { email: email.data, senha, dono: true });
  console.log('Conta do dono criada ou senha trocada.');
}

principal().catch((erro: unknown) => {
  console.error(
    erro instanceof Abortar || erro instanceof HostRecusado ? erro.message : 'Falha ao executar o comando.',
  );
  process.exit(1);
});
