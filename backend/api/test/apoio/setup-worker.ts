import pg from 'pg';
import { aplicarMigracoes } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { exigirHostPermitido } from '../../src/infraestrutura/seguranca/trava-host.ts';
import { comCliente, urlDeTeste, urlDoBanco } from './banco.ts';
import { BANCO_DO_WORKER } from './banco-worker.ts';
import { gravarDoisGrupos } from './cenario-dois-grupos.ts';

async function comAdmin(acao: (admin: pg.Client) => Promise<unknown>): Promise<void> {
  await comCliente(urlDoBanco(urlDeTeste(), 'postgres'), async (admin) => {
    await acao(admin);
  });
}

/**
 * Prepara o banco dos testes de workerd: recria do zero, migra (schema, roles e RLS), grava os grupos A e B do
 * cenário como owner e dá a pelada_app a senha de login de `PELADA_APP_SENHA`. A API conecta direto como
 * pelada_app, como em produção (nunca como owner, que ignora a RLS).
 */
export default async function preparar(): Promise<() => Promise<void>> {
  await exigirHostPermitido({ url: urlDeTeste() });
  const senha = process.env['PELADA_APP_SENHA'];
  if (!senha) throw new Error('PELADA_APP_SENHA ausente: o vitest.config deveria tê-la definido.');

  await comAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${BANCO_DO_WORKER} WITH (FORCE)`));
  await comAdmin((admin) => admin.query(`CREATE DATABASE ${BANCO_DO_WORKER}`));
  const url = urlDoBanco(urlDeTeste(), BANCO_DO_WORKER);
  await aplicarMigracoes({ url });
  await comCliente(url, async (owner) => {
    await gravarDoisGrupos(owner);
    await owner.query(`ALTER ROLE pelada_app LOGIN PASSWORD ${owner.escapeLiteral(senha)}`);
  });

  return () => comAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${BANCO_DO_WORKER} WITH (FORCE)`));
}
