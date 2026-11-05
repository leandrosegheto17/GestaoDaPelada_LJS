import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from '../isolamento/apoio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `asaas_evento_registrar` (planos-e-cobranca T15; PLA-13, PLA-41, PLA-42, PLA-48, PLA-49). Como `pelada_app` sem
 * contexto, que é como a rota do webhook (T35) abre a transação. G tem a assinatura `sub_g` (cancelada, do cenário);
 * cada caso desfaz o que gravou, salvo quando o caso é justamente a segunda chamada (aí as duas ficam na mesma
 * transação).
 *
 * Casos limite: id repetido; assinatura desconhecida; conta no contexto; slug no contexto; `dateCreated` fora do formato.
 *
 * Evidência da rede (registrar na T15 do tasks.md, pelo /executar): trocar `ON CONFLICT (id) DO NOTHING` por um INSERT
 * simples deixa vermelho o PLA-42 (vira 23505); tirar a exigência de contexto vazio deixa vermelho o PLA-13.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Registro {
  resultado: string;
  grupo_id: string | null;
  situacao: string | null;
  valor_centavos: number | null;
  pago_ate: string | null;
  cobranca_pro_id: string | null;
  ultimo_evento_em: string | null;
}

async function registrar(
  d: pg.Client,
  id: string,
  assinatura: string | null,
  dataCriacao: string | null = '2026-11-05 10:00:00',
): Promise<Registro[]> {
  const r = await d.query<Registro>(
    `SELECT resultado, grupo_id, situacao, valor_centavos, pago_ate::text, cobranca_pro_id, ultimo_evento_em
       FROM asaas_evento_registrar($1, 'PAYMENT_CONFIRMED', $2, 'pay_t15', $3, 'CONFIRMED', 990)`,
    [id, dataCriacao, assinatura],
  );
  return r.rows;
}

const semContexto: Contexto = {};

describe('asaas_evento_registrar', () => {
  it('PLA-42: o segundo registro do mesmo id devolve repetido e não muda a linha', async () => {
    const { db } = aberto;
    const r = await comoApp(db, semContexto, async (d) => {
      const primeiro = await registrar(d, 'evt_t15_rep', 'sub_g', '2026-11-05 10:00:00');
      const segundo = await registrar(d, 'evt_t15_rep', 'sub_g', '2026-11-06 11:00:00');
      await d.query('RESET ROLE');
      const linha = await d.query(
        `SELECT evento, to_char(data_criacao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS data
           FROM eventos_asaas WHERE id = 'evt_t15_rep'`,
      );
      return { primeiro: primeiro[0]?.resultado, segundo, linhas: linha.rows };
    });
    expect(r.primeiro).toBe('novo');
    expect(r.segundo).toEqual([
      {
        resultado: 'repetido',
        grupo_id: null,
        situacao: null,
        valor_centavos: null,
        pago_ate: null,
        cobranca_pro_id: null,
        ultimo_evento_em: null,
      },
    ]);
    expect(r.linhas).toEqual([{ evento: 'PAYMENT_CONFIRMED', data: '2026-11-05 10:00:00' }]);
  });

  it('PLA-48: evento novo de assinatura conhecida devolve o estado gravado dela', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, semContexto, async (d) => {
      await d.query('RESET ROLE');
      await d.query(
        `UPDATE assinaturas SET ultimo_evento_em = ('2026-11-01 08:30:00'::timestamp AT TIME ZONE 'America/Sao_Paulo')
          WHERE asaas_assinatura_id = 'sub_g'`,
      );
      await d.query('SET LOCAL ROLE pelada_app');
      return registrar(d, 'evt_t15_conhecida', 'sub_g');
    });
    expect(r).toEqual([
      {
        resultado: 'novo',
        grupo_id: cenario.grupoG,
        situacao: 'cancelada',
        valor_centavos: 990,
        pago_ate: '2026-01-05',
        cobranca_pro_id: 'pay_g',
        ultimo_evento_em: '2026-11-01 08:30:00',
      },
    ]);
  });

  it('PLA-49: assinatura desconhecida grava o evento e devolve sem estado', async () => {
    const { db } = aberto;
    const r = await comoApp(db, semContexto, async (d) => {
      const registro = await registrar(d, 'evt_t15_desconhecida', 'sub_nao_existe');
      await d.query('RESET ROLE');
      const n = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM eventos_asaas WHERE id = 'evt_t15_desconhecida'`);
      return { registro, n: n.rows[0]?.n };
    });
    expect(r.registro).toEqual([
      {
        resultado: 'novo',
        grupo_id: null,
        situacao: null,
        valor_centavos: null,
        pago_ate: null,
        cobranca_pro_id: null,
        ultimo_evento_em: null,
      },
    ]);
    expect(r.n).toBe(1);
  });

  it('PLA-49: sem id de assinatura no evento, grava e devolve sem estado', async () => {
    const { db } = aberto;
    const r = await comoApp(db, semContexto, (d) => registrar(d, 'evt_t15_sem_assinatura', null));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ resultado: 'novo', grupo_id: null });
  });

  it('PLA-48: dateCreated fora do formato do Asaas grava data nula', async () => {
    const { db } = aberto;
    const data = await comoApp(db, semContexto, async (d) => {
      await registrar(d, 'evt_t15_data', 'sub_g', '05/11/2026 10:00');
      await d.query('RESET ROLE');
      const r = await d.query<{ data: string | null }>(`SELECT data_criacao::text AS data FROM eventos_asaas WHERE id = 'evt_t15_data'`);
      return r.rows[0]?.data;
    });
    expect(data).toBeNull();
  });

  it('PLA-41: a linha gravada tem só os campos do evento, sem dado de pessoa', async () => {
    const { db } = aberto;
    const linha = await comoApp(db, semContexto, async (d) => {
      await registrar(d, 'evt_t15_campos', 'sub_g');
      await d.query('RESET ROLE');
      const r = await d.query(
        `SELECT id, evento, cobranca_id, assinatura_id, status, valor_centavos, efeito FROM eventos_asaas WHERE id = 'evt_t15_campos'`,
      );
      return r.rows[0];
    });
    expect(linha).toEqual({
      id: 'evt_t15_campos',
      evento: 'PAYMENT_CONFIRMED',
      cobranca_id: 'pay_t15',
      assinatura_id: 'sub_g',
      status: 'CONFIRMED',
      valor_centavos: 990,
      efeito: null,
    });
  });

  it.each([
    ['com conta no contexto', 'conta'],
    ['com slug no contexto', 'slug'],
  ] as const)('PLA-13: %s, 42501 e nada gravado', async (_nome, tipo) => {
    const { db, cenario } = aberto;
    const contexto: Contexto = tipo === 'conta' ? { conta: cenario.contaC } : { slug: cenario.slugG };
    await expect(comoApp(db, contexto, (d) => registrar(d, `evt_t15_${tipo}`, 'sub_g'))).rejects.toMatchObject({
      code: '42501',
    });
    const n = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM eventos_asaas WHERE id = $1', [`evt_t15_${tipo}`]);
    expect(n.rows[0]?.n).toBe(0);
  });
});
