import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioConta,
  criarConvite,
  criarLink,
  criarSessao,
  IP_HASH_1,
  sha256,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização de `conta_excluir` como anonimização (T8; ACE-28 a ACE-30, ACE-69). Versão
 * vigente: `1792843800000_conta-senha-bloqueio.sql:92`.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Exclusao {
  resultado: string;
  grupos: Array<{ id: string; nome: string }>;
}

async function excluir(db: pg.Client, conta: string, senha: string): Promise<Exclusao> {
  await comoAppAqui(db, conta);
  const r = await umaLinha<Exclusao>(db, 'SELECT * FROM conta_excluir($1)', [senha]);
  await comoSuper(db);
  return r;
}

async function tocar(db: pg.Client, hash: Buffer): Promise<string | null> {
  await comoAppAqui(db);
  const r = await umaLinha<{ conta: string | null }>(db, 'SELECT sessao_tocar($1) AS conta', [hash]);
  await comoSuper(db);
  return r.conta;
}

/** Dá à conta sem vínculo um vínculo de admin no grupo A, para A deixar de ser a única admin. */
async function segundaAdminNoGrupoA(db: pg.Client): Promise<void> {
  const { cenario } = aberto;
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())`,
    [cenario.contaSemVinculo, cenario.grupoA, cenario.contaA],
  );
}

/** Grava, como superusuário, um rastro da conta A em cada tabela de conta que a exclusão limpa. */
async function rastrosDeA(db: pg.Client): Promise<{ sessao: Buffer }> {
  const { cenario } = aberto;
  const sessao = await criarSessao(db, cenario.contaA);
  await criarLink(db, cenario.contaA, 'recuperacao');
  await criarConvite(db, cenario.grupoB, cenario.emailA, cenario.contaB);
  await db.query(`INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES ($1, $2, now(), false)`, [
    cenario.emailA,
    IP_HASH_1,
  ]);
  await db.query(`INSERT INTO envios_email (destino_hash, tipo, enviado_em) VALUES ($1, 'recuperacao', now())`, [
    sha256(cenario.emailA),
  ]);
  return { sessao };
}

describe('conta_excluir: exclusão', () => {
  it('ACE-28: com a senha certa e sem ser única admin, anonimiza a linha da conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      expect(await excluir(db, cenario.contaA, cenario.senhaA)).toEqual({ resultado: 'ok', grupos: [] });
      const c = await umaLinha<{ email: string; nome: string; senha_hash: string; e_dono: boolean; excluida: boolean }>(
        db,
        'SELECT email, nome, senha_hash, e_dono, excluida_em = now() AS excluida FROM contas WHERE id = $1',
        [cenario.contaA],
      );
      expect(c).toEqual({
        email: `excluida-${cenario.contaA}@invalido`,
        nome: 'Conta excluída',
        senha_hash: '!',
        e_dono: false,
        excluida: true,
      });
    });
  });

  it('ACE-28: apaga sessões, vínculos, links, convites ao e-mail, tentativas e envios da conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await rastrosDeA(db);
      expect((await excluir(db, cenario.contaA, cenario.senhaA)).resultado).toBe('ok');
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [cenario.contaA])).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM links_conta WHERE conta_id = $1', [cenario.contaA])).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM convites_admin WHERE email = $1', [cenario.emailA])).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE email = $1', [cenario.emailA])).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM envios_email WHERE destino_hash = $1', [sha256(cenario.emailA)])).toBe(0);
    });
  });

  it('ACE-28: nenhum nome ou e-mail da pessoa resta nas tabelas de conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await rastrosDeA(db);
      await excluir(db, cenario.contaA, cenario.senhaA);
      for (const tabela of ['contas', 'sessoes', 'links_conta', 'convites_admin', 'tentativas_login', 'vinculos_admin']) {
        const r = await db.query<{ linha: string }>(`SELECT row_to_json(t)::text AS linha FROM ${tabela} t`);
        const tudo = r.rows.map((l) => l.linha).join('\n');
        expect(tudo, tabela).not.toContain(cenario.emailA);
        expect(tudo, tabela).not.toContain('Conta A');
      }
    });
  });

  it('ACE-28: a auditoria registra a saída de cada grupo e aponta para a linha anonimizada', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await excluir(db, cenario.contaA, cenario.senhaA);
      const r = await db.query<{ grupo_id: string; entidade: string }>(
        `SELECT grupo_id, entidade FROM auditoria WHERE autor_conta_id = $1 AND acao = 'excluir_conta'`,
        [cenario.contaA],
      );
      expect(r.rows).toEqual([{ grupo_id: cenario.grupoA, entidade: 'vinculo_admin' }]);
      expect(await contar(db, 'SELECT 1 FROM contas WHERE id = $1 AND excluida_em IS NOT NULL', [cenario.contaA])).toBe(1);
    });
  });

  it('ACE-28: a exclusão não toca a conta B nem o vínculo da outra admin do grupo A', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      const sessaoB = await criarSessao(db, cenario.contaB);
      await excluir(db, cenario.contaA, cenario.senhaA);
      expect(await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [cenario.contaSemVinculo])).toBe(1);
      expect(await tocar(db, sessaoB.hash)).toBe(cenario.contaB);
      expect(await contar(db, `SELECT 1 FROM contas WHERE id = $1 AND nome = 'Conta B'`, [cenario.contaB])).toBe(1);
    });
  });

  it('ACE-28: o e-mail anonimizado fica livre para um cadastro novo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await excluir(db, cenario.contaA, cenario.senhaA);
      await comoAppAqui(db);
      const r = await umaLinha<{ situacao: string }>(db, 'SELECT situacao FROM conta_cadastrar($1, $2, $3, $4, $5)', [
        cenario.emailA,
        'Pessoa Nova',
        'senha nova 12345',
        '2026-11-01',
        sha256('token novo'),
      ]);
      await comoSuper(db);
      expect(r.situacao).toBe('nova');
    });
  });

  it('ACE-69: a sessão aberta em outro aparelho some e sessao_tocar devolve nulo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      const outroAparelho = await criarSessao(db, cenario.contaA);
      expect(await tocar(db, outroAparelho.hash)).toBe(cenario.contaA);
      await excluir(db, cenario.contaA, cenario.senhaA);
      expect(await tocar(db, outroAparelho.hash)).toBeNull();
    });
  });
});

describe('conta_excluir: recusas', () => {
  it('ACE-29: única admin de grupo não arquivado recebe a lista (id e nome) e nada é apagado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await rastrosDeA(db);
      const r = await excluir(db, cenario.contaA, cenario.senhaA);
      expect(r).toEqual({ resultado: 'unico_admin', grupos: [{ id: cenario.grupoA, nome: 'Grupo A' }] });
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(1);
      expect(await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [cenario.contaA])).toBe(1);
      expect(await contar(db, 'SELECT 1 FROM links_conta WHERE conta_id = $1', [cenario.contaA])).toBe(1);
      expect(await contar(db, 'SELECT 1 FROM convites_admin WHERE email = $1', [cenario.emailA])).toBe(1);
      expect(await contar(db, `SELECT 1 FROM contas WHERE id = $1 AND nome = 'Conta A' AND excluida_em IS NULL`, [cenario.contaA])).toBe(1);
    });
  });

  it('ACE-29: grupo arquivado não conta como grupo de que é a única admin', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoA]);
      expect(await excluir(db, cenario.contaA, cenario.senhaA)).toEqual({ resultado: 'ok', grupos: [] });
    });
  });

  it('ACE-29: com dois grupos em que é a única admin, lista os dois em ordem de nome', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const outro = await umaLinha<{ id: string }>(
        db,
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ('Aaa Primeiro', 'aaa-primeiro', 'sabado', 'semanal', '09:00', $1, now()) RETURNING id`,
        [cenario.contaA],
      );
      await db.query(`INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())`, [
        cenario.contaA,
        outro.id,
      ]);
      const r = await excluir(db, cenario.contaA, cenario.senhaA);
      expect(r.grupos).toEqual([
        { id: outro.id, nome: 'Aaa Primeiro' },
        { id: cenario.grupoA, nome: 'Grupo A' },
      ]);
    });
  });

  it('ACE-30: senha errada devolve senha_incorreta e nada é apagado nem anonimizado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await rastrosDeA(db);
      expect(await excluir(db, cenario.contaA, 'senha errada')).toEqual({ resultado: 'senha_incorreta', grupos: [] });
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(1);
      expect(await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [cenario.contaA])).toBe(1);
      expect(await contar(db, `SELECT 1 FROM contas WHERE id = $1 AND email = $2 AND excluida_em IS NULL`, [
        cenario.contaA,
        cenario.emailA,
      ])).toBe(1);
      expect(await contar(db, 'SELECT 1 FROM falhas_senha_atual WHERE conta_id = $1', [cenario.contaA])).toBe(1);
    });
  });

  it('ACE-30: com 5 falhas da senha atual em 15 min, a exclusão é bloqueada mesmo com a senha certa', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await db.query(`INSERT INTO falhas_senha_atual (conta_id, momento) SELECT $1, now() FROM generate_series(1, 5)`, [
        cenario.contaA,
      ]);
      expect(await excluir(db, cenario.contaA, cenario.senhaA)).toEqual({ resultado: 'bloqueado', grupos: [] });
      expect(await contar(db, 'SELECT 1 FROM contas WHERE id = $1 AND excluida_em IS NULL', [cenario.contaA])).toBe(1);
    });
  });

  it('ACE-30: conta já excluída não pode ser excluída de novo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await excluir(db, cenario.contaA, cenario.senhaA);
      expect((await excluir(db, cenario.contaA, cenario.senhaA)).resultado).toBe('senha_incorreta');
    });
  });
});
