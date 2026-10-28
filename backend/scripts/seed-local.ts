import { semearBancoLocal } from '../api/src/infraestrutura/db/repositorios/seed-local.ts';
import { exigirHostPermitido } from '../api/src/infraestrutura/seguranca/trava-host.ts';
import { senha as esquemaSenha } from '../contrato/src/primitivos.ts';
import { exigirBancoNoAr } from './comum/exigir-banco.ts';
import { DADOS_DO_SEED } from './seed-local/dados.ts';

/**
 * `pnpm seed`: dados de exemplo no banco local já migrado (FUN-05). Só roda em host local: a trava é chamada sem
 * `--alvo`, então qualquer outro host é recusado antes de conectar. Define também a senha de login das roles
 * locais a partir do `.env` (PELADA_APP_SENHA e PELADA_BACKUP_RO_SENHA).
 */
async function principal(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  await exigirHostPermitido({ url });
  const app = process.env['PELADA_APP_SENHA'];
  const backup = process.env['PELADA_BACKUP_RO_SENHA'];
  if (!app || !backup) throw new Error('Defina PELADA_APP_SENHA e PELADA_BACKUP_RO_SENHA no .env antes do seed.');
  const admin = process.env['SEED_SENHA_ADMIN'];
  if (!admin || !esquemaSenha.safeParse(admin).success) {
    throw new Error('Defina SEED_SENHA_ADMIN no .env (8 a 72 caracteres) antes do seed.');
  }
  await exigirBancoNoAr(url);

  const resumo = await semearBancoLocal(url as string, DADOS_DO_SEED, { app, backup, admin });
  console.log('Seed local concluído:', JSON.stringify(resumo));
  console.log(`Grupo: ${DADOS_DO_SEED.grupo.slug}. Conta admin: ${DADOS_DO_SEED.admin.email}.`);
}

principal().catch((erro: unknown) => {
  // A trava e o aviso de banco fora do ar já trazem a mensagem para a pessoa; nenhuma delas inclui a URL.
  console.error(erro instanceof Error ? erro.message : 'Falha ao semear o banco local.');
  process.exit(1);
});
