import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';

// Proteções das funções SECURITY DEFINER (design C1, Risks & Concerns; AD-008; ACE-43): search_path fixo e nenhum
// EXECUTE para PUBLIC. Só pelada_app executa, menos conta_definir_senha (só o owner: script do dono e seed).
const SEARCH_PATH = 'search_path=public, pg_temp';
const SO_DO_OWNER = ['conta_definir_senha'];

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

interface Definer {
  nome: string;
  config: string[] | null;
  publico: boolean;
  app: boolean;
}

/** Toda função SECURITY DEFINER do schema public, com o search_path e quem executa. */
async function definers(): Promise<Definer[]> {
  const { rows } = await cliente.query<Definer>(
    `SELECT p.proname AS nome, p.proconfig AS config,
            EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
            has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app
       FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      ORDER BY 1`,
  );
  return rows;
}

/** O que está errado em cada função: sem search_path fixo, EXECUTE para PUBLIC, ou EXECUTE fora do esperado. */
function problemas(funcoes: Definer[]): string[] {
  return funcoes.flatMap((f) => [
    ...(f.config?.includes(SEARCH_PATH) ? [] : [`${f.nome}: sem SET ${SEARCH_PATH}`]),
    ...(f.publico ? [`${f.nome}: EXECUTE para PUBLIC`] : []),
    ...(f.app === SO_DO_OWNER.includes(f.nome) ? [`${f.nome}: EXECUTE de pelada_app fora do esperado`] : []),
  ]);
}

describe('funções SECURITY DEFINER (AD-008)', () => {
  it('as funções de conta e grupos_visiveis existem como SECURITY DEFINER', async () => {
    // admins_listar entrou na T14 (lista dos admins com nome e e-mail sob a RLS de contas; ver a migration).
    expect((await definers()).map((f) => f.nome)).toEqual([
      'admins_listar',
      'conta_cadastrar',
      'conta_definir_senha',
      'conta_entrar',
      'conta_excluir',
      'conta_trocar_senha',
      'convite_aceitar',
      'convite_cadastrar',
      'convite_criar',
      'convite_ler',
      // email_cota_reservar entrou na T63 (teto diário de e-mails, ACE-72).
      'email_cota_reservar',
      // email_origem_registrar entrou na T66 (teto de e-mails por origem, ACE-73).
      'email_origem_registrar',
      'grupos_visiveis',
      'link_confirmar',
      'link_nova_senha',
      'link_pedir',
      // link_pedir_com_confirmacao entrou na T65 ("esqueci a senha" de conta não confirmada, ACE-73).
      'link_pedir_com_confirmacao',
      'sessao_tocar',
    ]);
  });

  it('todas têm search_path fixo, nenhuma tem EXECUTE para PUBLIC, e só pelada_app executa', async () => {
    expect(problemas(await definers())).toEqual([]);
  });

  it('conta_definir_senha não tem EXECUTE para pelada_app', async () => {
    const { rows } = await cliente.query<{ ok: boolean }>(
      "SELECT has_function_privilege('pelada_app', 'conta_definir_senha(text, text, boolean)', 'EXECUTE') AS ok",
    );
    expect(rows).toEqual([{ ok: false }]);
  });

  it('uma função nova sem SET search_path é apontada', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query('CREATE FUNCTION intrusa() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$');
      await cliente.query('REVOKE ALL ON FUNCTION intrusa() FROM PUBLIC');
      await cliente.query('GRANT EXECUTE ON FUNCTION intrusa() TO pelada_app');
      expect(problemas(await definers())).toEqual(['intrusa: sem SET search_path=public, pg_temp']);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  it('uma função nova com o EXECUTE padrão (PUBLIC) é apontada', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        'CREATE FUNCTION intrusa() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$',
      );
      expect(problemas(await definers())).toEqual(['intrusa: EXECUTE para PUBLIC']);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  it('uma função nova sem EXECUTE para pelada_app é apontada', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        'CREATE FUNCTION intrusa() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$',
      );
      await cliente.query('REVOKE ALL ON FUNCTION intrusa() FROM PUBLIC');
      expect(problemas(await definers())).toEqual(['intrusa: EXECUTE de pelada_app fora do esperado']);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});
