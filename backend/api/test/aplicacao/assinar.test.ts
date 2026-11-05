import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRECO_PRO_CENTAVOS } from '@pelada/dominio';
import {
  assinar,
  descricaoDaAssinatura,
  type PedidoAssinar,
} from '../../src/aplicacao/plano/assinar.ts';
import { asaasMemoria, URL_FATURA_FALSA } from '../../src/infraestrutura/asaas/memoria.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import {
  abrirCenarioGrupos,
  criarGrupoComoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Assinar o Pro (planos-e-cobranca T32; PLA-29, PLA-33, PLA-35, PLA-36; AD-096, AD-114), como `pelada_app` contra o
 * cenário de grupos e o Asaas em memória (T30). B cria H e nunca assinou (cliente novo); C cria G, que já tem a
 * assinatura cancelada `sub_g` (cliente reaproveitado). Cada teste roda numa transação desfeita.
 *
 * Casos limite e estados, listados antes do código: falha em cada uma das 3 chamadas; cliente já existente; pendente
 * já existe; trial, Free, inadimplente e cancelado.
 *
 * Evidência da rede (registrar na T32 do tasks.md, pelo /executar): tirar o `compensar` da falha de `primeiraCobranca`
 * deixa vermelho "chama removerAssinatura uma vez"; mover o `criarCliente` para antes de `pendenteOuAtiva` deixa
 * vermelho "pendente já existe: nenhuma chamada".
 */

const CPF = '52998224725';
const HOJE = '2026-11-20';

let aberto: CenarioGruposAberto;
let h2: string;
const asaas = asaasMemoria();
const logs: Array<Record<string, string | number>> = [];
const registrar = (l: Record<string, string | number>) => {
  logs.push(l);
};

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  h2 = (
    await criarGrupoComoConta(
      aberto.db,
      aberto.cenario.contaB,
      'Pelada de Domingo',
      'pelada-de-domingo-t32',
    )
  ).id;
});

beforeEach(() => {
  asaas.limpar();
  logs.length = 0;
});

afterAll(async () => {
  await aberto?.fechar();
});

function pedido(grupoId: string, conta: string): PedidoAssinar {
  return { grupoId, conta, nome: 'Bia Souza', cpf: CPF, hoje: HOJE };
}

async function assinaturasDe(db: Db, grupoId: string): Promise<number> {
  const r = await sql<{
    n: number;
  }>`SELECT count(*)::int AS n FROM assinaturas WHERE grupo_id = ${grupoId}`.execute(db);
  return r.rows[0]?.n ?? 0;
}

describe('assinar: cliente e assinatura (PLA-29)', () => {
  it('PLA-29: cliente criado com externalReference = id da conta e o e-mail da conta; assinatura com hoje e o nome do grupo', async () => {
    const { url, db: superDb, cenario } = aberto;
    const email = (
      await superDb.query<{ email: string }>('SELECT email FROM contas WHERE id = $1', [
        cenario.contaB,
      ])
    ).rows[0]!.email;
    const nomeH = (
      await superDb.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [
        cenario.grupoH,
      ])
    ).rows[0]!.nome;
    await comDb(url, cenario.contaB, async (db) => {
      const r = await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB), { registrar });
      expect(r).toEqual({
        resultado: 'criada',
        faturaUrl: expect.stringContaining(URL_FATURA_FALSA),
      });
      expect(asaas.chamadas.map((c) => c.operacao)).toEqual([
        'criarCliente',
        'criarAssinatura',
        'primeiraCobranca',
      ]);
      expect(asaas.chamadas[0]!.dados).toEqual({
        name: 'Bia Souza',
        cpfCnpj: CPF,
        email,
        externalReference: cenario.contaB,
      });
      expect(asaas.chamadas[1]!.dados).toMatchObject({
        valorCentavos: PRECO_PRO_CENTAVOS,
        nextDueDate: HOJE,
        description: descricaoDaAssinatura(nomeH),
        externalReference: cenario.grupoH,
      });
      expect(await assinaturasDe(db, cenario.grupoH)).toBe(1);
    });
  });

  it('PLA-29: segundo grupo da mesma conta reaproveita o cliente', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaB, async (db) => {
      expect((await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB))).resultado).toBe(
        'criada',
      );
      const cliente = (asaas.chamadas[1]!.dados as { customer: string }).customer;
      asaas.chamadas.length = 0;
      expect((await assinar(db, asaas, pedido(h2, cenario.contaB))).resultado).toBe('criada');
      expect(asaas.chamadas.map((c) => c.operacao)).toEqual([
        'criarAssinatura',
        'primeiraCobranca',
      ]);
      expect((asaas.chamadas[0]!.dados as { customer: string }).customer).toBe(cliente);
    });
  });

  it('PLA-29: G, com a assinatura cancelada do cenário, reaproveita o cliente dela', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, async (db) => {
      expect((await assinar(db, asaas, pedido(cenario.grupoG, cenario.contaC))).resultado).toBe(
        'criada',
      );
      expect(asaas.chamadas.map((c) => c.operacao)).not.toContain('criarCliente');
    });
  });
});

describe('assinar: recusas sem chamar o Asaas (PLA-32, PLA-33)', () => {
  it('PLA-32: admin convidada recebe so_quem_criou e o Asaas não recebe chamada', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaO, async (db) => {
      expect(await assinar(db, asaas, pedido(cenario.grupoG, cenario.contaO))).toEqual({
        resultado: 'so_quem_criou',
      });
    });
    expect(asaas.chamadas).toEqual([]);
  });

  it('PLA-33: pendente já existe: assinatura_pendente com a fatura dela e nenhuma chamada', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaB, async (db) => {
      const primeira = await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB));
      expect(primeira.resultado).toBe('criada');
      asaas.chamadas.length = 0;
      const segunda = await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB));
      expect(segunda).toEqual({
        resultado: 'assinatura_pendente',
        faturaUrl: primeira.resultado === 'criada' ? primeira.faturaUrl : '',
      });
      expect(asaas.chamadas).toEqual([]);
      expect(await assinaturasDe(db, cenario.grupoH)).toBe(1);
    });
  });

  it('PLA-33: ativa já existe: assinatura_ativa e nenhuma chamada', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaB, async (db) => {
      await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB));
      await sql`RESET ROLE`.execute(db);
      await sql`UPDATE assinaturas SET situacao = 'ativa' WHERE grupo_id = ${cenario.grupoH} AND situacao = 'aguardando_pagamento'`.execute(
        db,
      );
      await sql`SET ROLE pelada_app`.execute(db);
      asaas.chamadas.length = 0;
      expect((await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB))).resultado).toBe(
        'assinatura_ativa',
      );
      expect(asaas.chamadas).toEqual([]);
    });
  });
});

describe('assinar: falhas do Asaas (PLA-36, AD-114)', () => {
  it.each([
    ['criarCliente', 1],
    ['criarAssinatura', 2],
  ] as const)('PLA-36: falha em %s não grava nada e não repete', async (operacao, n) => {
    const { url, cenario } = aberto;
    asaas.falharNa(n);
    await comDb(url, cenario.contaB, async (db) => {
      expect(await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB))).toEqual({
        resultado: 'pagamento_indisponivel',
      });
      expect(asaas.chamadas.filter((c) => c.operacao === operacao)).toHaveLength(1);
      expect(asaas.chamadas.map((c) => c.operacao)).not.toContain('removerAssinatura');
      expect(await assinaturasDe(db, cenario.grupoH)).toBe(0);
    });
  });

  it('PLA-36: falha em primeiraCobranca chama removerAssinatura uma vez, responde pagamento_indisponivel e não grava nada', async () => {
    const { url, cenario } = aberto;
    asaas.falharNa(3);
    await comDb(url, cenario.contaB, async (db) => {
      expect(
        await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB), { registrar }),
      ).toEqual({
        resultado: 'pagamento_indisponivel',
      });
      expect(asaas.chamadas.map((c) => c.operacao)).toEqual([
        'criarCliente',
        'criarAssinatura',
        'primeiraCobranca',
        'removerAssinatura',
      ]);
      const criada = [...asaas.assinaturas.values()][0]!;
      expect(asaas.chamadas[3]!.dados).toBe(criada.id);
      expect(criada.removida).toBe(true);
      expect(await assinaturasDe(db, cenario.grupoH)).toBe(0);
      expect(logs).toEqual([]);
    });
  });

  it('PLA-36: falha também na remoção é registrada no log com o id da assinatura, sem CPF (AD-114)', async () => {
    const { url, cenario } = aberto;
    asaas.falharNa(3);
    asaas.falharNa(4);
    await comDb(url, cenario.contaB, async (db) => {
      expect(
        (await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB), { registrar })).resultado,
      ).toBe('pagamento_indisponivel');
      const criada = [...asaas.assinaturas.values()][0]!;
      expect(logs).toEqual([
        expect.objectContaining({ evento: 'asaas_compensacao_falhou', assinaturaId: criada.id }),
      ]);
      expect(JSON.stringify(logs)).not.toContain(CPF);
      expect(JSON.stringify(logs)).not.toContain('Bia Souza');
    });
  });
});

describe('assinar: plano atual (casos limite)', () => {
  it.each([
    ['trial', '2026-11-10'],
    ['trial', '2026-10-01'],
    ['inadimplente', null],
    ['cancelado', null],
  ] as const)(
    'PLA-29: grupo em %s (trial_inicio %s) assina e o plano não muda (PLA-31)',
    async (s, t) => {
      const { url, cenario } = aberto;
      await comDb(url, cenario.contaB, async (db) => {
        await sql`RESET ROLE`.execute(db);
        await sql`UPDATE grupos SET situacao_comercial = ${s}, trial_inicio = ${t}::date WHERE id = ${cenario.grupoH}`.execute(
          db,
        );
        await sql`SET ROLE pelada_app`.execute(db);
        expect((await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB))).resultado).toBe(
          'criada',
        );
        await sql`RESET ROLE`.execute(db);
        const g = await sql<{
          s: string;
        }>`SELECT situacao_comercial AS s FROM grupos WHERE id = ${cenario.grupoH}`.execute(db);
        expect(g.rows[0]?.s).toBe(s);
      });
    },
  );
});

describe('assinar: CPF nunca guardado (PLA-35)', () => {
  it('PLA-35: depois do sucesso, nenhuma tabela nem a auditoria contém o CPF', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaB, async (db) => {
      expect((await assinar(db, asaas, pedido(cenario.grupoH, cenario.contaB))).resultado).toBe(
        'criada',
      );
      // Busca como superusuário, na mesma transação (ainda não desfeita), em toda coluna de texto do schema public.
      await sql`RESET ROLE`.execute(db);
      const colunas = await sql<{ tabela: string; coluna: string }>`
        SELECT table_name AS tabela, column_name AS coluna
          FROM information_schema.columns
         WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb', 'json')`.execute(
        db,
      );
      const achados: string[] = [];
      for (const { tabela, coluna } of colunas.rows) {
        const r = await sql<{ n: number }>`
          SELECT count(*)::int AS n FROM ${sql.table(tabela)} WHERE ${sql.ref(coluna)}::text LIKE ${`%${CPF}%`}`.execute(
          db,
        );
        if ((r.rows[0]?.n ?? 0) > 0) achados.push(`${tabela}.${coluna}`);
      }
      expect(achados).toEqual([]);
    });
  });
});
