import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * Transação e auditoria sem dado pessoal nas rotas do financeiro (financeiro T33; FIN-21, FIN-43, FIN-44), com o app
 * real como `pelada_app`, o relógio fixo em 2026-10-15 e a criadora C de G.
 *
 * - FIN-43, FIN-21: para cada uma das 8 escritas, uma trigger de teste em `auditoria` (criada como superusuário e
 *   removida no `finally`) lança na inserção do evento daquela escrita; a rota responde 500 e o caixa, a auditoria e
 *   o acesso de O ficam como antes: a escrita e o evento estão na mesma transação da requisição. O `SET LOCAL` da conta
 *   antes da primeira consulta aparece no autor de cada evento gravado (`autor_conta_id` = C, lido de `app_conta_id()`)
 *   e no fato de as escritas passarem pela RLS do financeiro, que só aceita quem tem acesso no contexto.
 * - FIN-44: com a descrição "Churrasco do Zé", o apelido "Toninho" (que entra na descrição da mensalidade), o telefone
 *   `11987654321` e o ano 1987 no jogador, nenhuma linha de `auditoria` do financeiro contém os quatro, e o `resumo`
 *   tem só ids, datas, meses, tipo e valores. Os uuids saem do texto antes da busca (podem conter "1987" por acaso).
 *
 * Molde: `auditoria-elenco.test.ts:66-89`.
 */

let aberto: CenarioGruposAberto;

const DESCRICAO = 'Churrasco do Zé';
const APELIDO = 'Toninho';
const TELEFONE = '11987654321';
const ANO = 1987;

const ACOES_DO_FINANCEIRO = [
  'financeiro_config_alterada',
  'pagamento_marcado',
  'pagamento_desmarcado',
  'lancamento_criado',
  'lancamento_editado',
  'lancamento_excluido',
  'financeiro_concedido',
  'financeiro_retirado',
] as const;
type AcaoDoFinanceiro = (typeof ACOES_DO_FINANCEIRO)[number];

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RE_UUID_INTEIRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const TIPOS = new Set(['entrada', 'saida']);

const g = () => `/grupos/${aberto.cenario.grupoG}`;

interface Escrita {
  acao: AcaoDoFinanceiro;
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: () => string;
  corpo?: () => unknown;
  /** Estado de que a escrita precisa, como superusuário, antes do pedido. */
  preparar?: () => Promise<void>;
  status: number;
}

let avulso = '';

async function criarAvulso(): Promise<void> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'saida', '2026-10-03', $2, 4321, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, DESCRICAO, cenario.contaC],
  );
  avulso = r.rows[0]!.id;
}

async function darAcessoAO(): Promise<void> {
  await aberto.db.query('UPDATE vinculos_admin SET acessa_financeiro = true WHERE grupo_id = $1 AND conta_id = $2', [
    aberto.cenario.grupoG,
    aberto.cenario.contaO,
  ]);
}

const ESCRITAS: Escrita[] = [
  {
    acao: 'financeiro_config_alterada',
    metodo: 'PUT',
    caminho: () => `${g()}/financeiro/config`,
    corpo: () => ({ mensalidadeCentavos: 6000, saldoInicialCentavos: -2500, dataSaldoInicial: '2026-01-01' }),
    status: 200,
  },
  {
    acao: 'pagamento_marcado',
    metodo: 'POST',
    caminho: () => `${g()}/financeiro/pagamentos`,
    corpo: () => ({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' }),
    status: 204,
  },
  {
    acao: 'pagamento_desmarcado',
    metodo: 'DELETE',
    caminho: () => `${g()}/financeiro/pagamentos/${aberto.cenario.idsG.jogadorHistorico}/2026-01`,
    status: 204,
  },
  {
    acao: 'lancamento_criado',
    metodo: 'POST',
    caminho: () => `${g()}/financeiro/lancamentos`,
    corpo: () => ({ tipo: 'saida', data: '2026-10-12', descricao: DESCRICAO, valorCentavos: 15000 }),
    status: 201,
  },
  {
    acao: 'lancamento_editado',
    metodo: 'PUT',
    caminho: () => `${g()}/financeiro/lancamentos/${avulso}`,
    corpo: () => ({ tipo: 'saida', data: '2026-10-03', descricao: `${DESCRICAO} 2`, valorCentavos: 5432 }),
    preparar: criarAvulso,
    status: 200,
  },
  {
    acao: 'lancamento_excluido',
    metodo: 'DELETE',
    caminho: () => `${g()}/financeiro/lancamentos/${avulso}`,
    preparar: criarAvulso,
    status: 204,
  },
  {
    acao: 'financeiro_concedido',
    metodo: 'PATCH',
    caminho: () => `${g()}/admins/${aberto.cenario.contaO}/financeiro`,
    corpo: () => ({ acessaFinanceiro: true }),
    status: 200,
  },
  {
    acao: 'financeiro_retirado',
    metodo: 'PATCH',
    caminho: () => `${g()}/admins/${aberto.cenario.contaO}/financeiro`,
    corpo: () => ({ acessaFinanceiro: false }),
    preparar: darAcessoAO,
    status: 200,
  },
];

function enviar(e: Escrita): Promise<Response> {
  return pedir(aberto, {
    metodo: e.metodo,
    caminho: e.caminho(),
    conta: aberto.cenario.contaC,
    ...(e.corpo ? { corpo: e.corpo() } : {}),
  });
}

/** O caixa, a auditoria e os acessos de G. */
async function retrato(): Promise<string> {
  const { db, cenario } = aberto;
  const partes = await Promise.all([
    db.query('SELECT mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial::text FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]),
    db.query('SELECT id, tipo, data::text, descricao, valor_centavos FROM lancamentos WHERE grupo_id = $1 ORDER BY id', [cenario.grupoG]),
    db.query('SELECT jogador_id, mes, lancamento_id FROM pagamentos_mes WHERE grupo_id = $1 ORDER BY jogador_id, mes', [cenario.grupoG]),
    db.query('SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = $1', [cenario.grupoG]),
    db.query('SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id', [cenario.grupoG]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

/** Trigger de teste que lança na inserção do evento `acao` em `auditoria`; devolve a função que a remove. */
async function falharAuditoria(acao: AcaoDoFinanceiro): Promise<() => Promise<void>> {
  const { db } = aberto;
  await db.query(`
    CREATE OR REPLACE FUNCTION teste_falhar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'falha forçada na auditoria (teste)'; END $$`);
  await db.query(`
    CREATE TRIGGER teste_falhar_auditoria BEFORE INSERT ON auditoria
      FOR EACH ROW WHEN (NEW.acao = '${acao}') EXECUTE FUNCTION teste_falhar_auditoria()`);
  return async () => {
    await db.query('DROP TRIGGER IF EXISTS teste_falhar_auditoria ON auditoria');
    await db.query('DROP FUNCTION IF EXISTS teste_falhar_auditoria()');
  };
}

/** As linhas de auditoria do financeiro de G, como texto (sem `momento`) e com o `resumo` à parte. */
async function linhasDoFinanceiro() {
  const r = await aberto.db.query<{ texto: string; acao: string; resumo: unknown; autor_conta_id: string }>(
    // Sem `momento` (microssegundos) e sem o `id` sequencial: os dois poderiam conter "1987" por acaso.
    `SELECT (to_jsonb(a) - 'momento' - 'id')::text AS texto, a.acao, a.resumo, a.autor_conta_id
       FROM auditoria a
      WHERE a.grupo_id = $1 AND a.acao = ANY($2::text[])`,
    [aberto.cenario.grupoG, [...ACOES_DO_FINANCEIRO]],
  );
  return r.rows;
}

/** As folhas do `resumo` que não são id, data, mês, tipo, número, booleano nem nulo. */
function folhasProibidas(valor: unknown, caminho = 'resumo'): string[] {
  if (valor === null || typeof valor === 'number' || typeof valor === 'boolean') return [];
  if (typeof valor === 'string') {
    const ok = RE_UUID_INTEIRO.test(valor) || RE_DATA.test(valor) || RE_MES.test(valor) || TIPOS.has(valor);
    return ok ? [] : [`${caminho} = ${JSON.stringify(valor)}`];
  }
  if (Array.isArray(valor)) return valor.flatMap((v, i) => folhasProibidas(v, `${caminho}[${i}]`));
  if (typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) => folhasProibidas(v, `${caminho}.${k}`));
  }
  return [`${caminho}: tipo ${typeof valor}`];
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  // Os marcadores de dado pessoal no jogador que entra na descrição da mensalidade.
  await aberto.db.query('UPDATE jogadores SET telefone = $2, ano_nascimento = $3 WHERE id = $1', [
    aberto.cenario.idsG.jogadorAtivo,
    TELEFONE,
    ANO,
  ]);
});

afterAll(async () => {
  await aberto?.db.query('DROP TRIGGER IF EXISTS teste_falhar_auditoria ON auditoria').catch(() => undefined);
  await aberto?.fechar();
});

afterEach(async () => {
  await restaurarCaixa(aberto);
});

describe('escrita e auditoria numa transação (FIN-43, FIN-21)', () => {
  it.each(ESCRITAS.map((e) => [e.acao, e] as const))(
    'FIN-43: falha forçada no evento %s dá 500 e nada fica gravado',
    async (_acao, e) => {
      await e.preparar?.();
      const antes = await retrato();
      const remover = await falharAuditoria(e.acao);
      try {
        const r = await enviar(e);
        expect(r.status).toBe(500);
        expect(await r.json()).toEqual({ erro: 'Erro interno.' });
      } finally {
        await remover();
      }
      expect(await retrato()).toBe(antes);
    },
  );

  it('FIN-43: sem falha, cada escrita grava o evento com a conta da sessão como autora', async () => {
    for (const e of ESCRITAS) {
      await e.preparar?.();
      const r = await enviar(e);
      expect(r.status, e.acao).toBe(e.status);
    }
    const linhas = await linhasDoFinanceiro();
    for (const acao of ACOES_DO_FINANCEIRO) {
      const doEvento = linhas.filter((l) => l.acao === acao);
      expect(doEvento.length, acao).toBeGreaterThanOrEqual(1);
      for (const l of doEvento) expect(l.autor_conta_id, acao).toBe(aberto.cenario.contaC);
    }
  });
});

describe('auditoria sem dado pessoal (FIN-44)', () => {
  beforeAll(async () => {
    // Passa por todas as escritas com os marcadores, uma vez, para o que segue ler os eventos.
    for (const e of ESCRITAS) {
      await e.preparar?.();
      const r = await enviar(e);
      if (r.status !== e.status) throw new Error(`${e.acao}: esperava ${e.status}, veio ${r.status}: ${await r.text()}`);
    }
  });

  it('FIN-44: todas as escritas deixaram evento', async () => {
    const acoes = new Set((await linhasDoFinanceiro()).map((l) => l.acao));
    for (const acao of ACOES_DO_FINANCEIRO) expect(acoes, acao).toContain(acao);
  });

  it('FIN-44: nenhuma linha contém a descrição, o apelido, o telefone nem o ano', async () => {
    const linhas = await linhasDoFinanceiro();
    expect(linhas.length).toBeGreaterThanOrEqual(ACOES_DO_FINANCEIRO.length);
    for (const l of linhas) {
      const semIds = l.texto.replace(RE_UUID, '<id>');
      expect(semIds, l.acao).not.toContain(DESCRICAO);
      expect(semIds, l.acao).not.toContain('Churrasco');
      expect(semIds, l.acao).not.toContain(APELIDO);
      expect(semIds, l.acao).not.toContain(TELEFONE);
      expect(semIds, l.acao).not.toContain(String(ANO));
    }
  });

  it('FIN-44: os eventos têm só ids, datas, meses, tipo e valores', async () => {
    for (const l of await linhasDoFinanceiro()) {
      expect(folhasProibidas(l.resumo), l.acao).toEqual([]);
    }
  });
});
