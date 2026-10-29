import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as habilidades from '../../src/infraestrutura/db/repositorios/habilidades.ts';
import * as jogadores from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Auditoria da feature sem dado pessoal (T50; GEL-113). Todas as escritas auditadas da feature rodam como pelada_app,
// pelos repositórios, com um jogador que tem telefone e ano de nascimento; nenhum `resumo` pode levá-los.

const HOJE = '2026-10-20';
const TELEFONE = '21987654321';
const ANO = 1983;
const DADOS_GRUPO = { nome: 'Pelada Auditoria', diaSemana: 'quarta', frequencia: 'semanal', horario: '20:00' } as const;

/** Os eventos da spec (GEL-10, GEL-22, GEL-28, GEL-42, GEL-45, GEL-51, GEL-57, GEL-71, GEL-77, GEL-93). */
const EVENTOS = [
  'grupo_criado',
  'grupo_arquivado',
  'grupo_reativado',
  'jogador_criado',
  'jogador_excluido',
  'jogador_pontuacao_inicial_alterada',
  'jogador_inativado',
  'jogador_reativado',
  'jogador_periodo_corrigido',
  'jogador_inicio_alterado',
  'habilidade_excluida',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

let b: BancoDeRepositorio;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

interface Linha {
  acao: string;
  resumo: unknown;
}

/** Roda, como pelada_app e numa conta nova, cada escrita auditada da feature; devolve a auditoria do grupo. */
async function percorrerAFeature(): Promise<Linha[]> {
  const conta = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [conta, `${conta}@exemplo.com`],
  );
  const como = <T>(acao: (db: Db) => Promise<T>) => comDb(b.urlApp, { conta }, acao);
  const exigir = <T extends { ok: boolean } | null>(r: T): T => {
    if (!r || !r.ok) throw new Error(`escrita recusada: ${JSON.stringify(r)}`);
    return r;
  };

  const g = await como((db) => grupos.criar(db, DADOS_GRUPO, `auditoria-${randomUUID().slice(0, 8)}`));
  const dados = { apelido: 'Fulano', anoNascimento: ANO, posicao: 'meia' as const, telefone: TELEFONE };
  const criado = exigir(
    await como((db) => jogadores.criar(db, g.id, { ...dados, pontuacaoInicial: 12, dataEntrada: '2026-01-05' }, HOJE)),
  );
  if (!criado.ok) throw new Error('inalcançável');
  const id = criado.id;
  exigir(await como((db) => jogadores.editar(db, g.id, id, { ...dados, pontuacaoInicial: 40 })));
  exigir(await como((db) => jogadores.inativar(db, g.id, id, '2026-03-01', HOJE)));
  exigir(await como((db) => jogadores.reativar(db, g.id, id, '2026-04-01', HOJE)));
  const [primeiro] = (
    await b.owner.query<{ id: string }>('SELECT id FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio', [id])
  ).rows;
  exigir(await como((db) => jogadores.corrigirPeriodo(db, g.id, id, primeiro!.id, { saida: '2026-03-10' }, HOJE)));
  exigir(await como((db) => jogadores.alterarInicio(db, g.id, id, '2026-01-02', HOJE)));

  // Excluir pede um jogador sem histórico: um segundo, com telefone e ano também.
  const outro = exigir(
    await como((db) => jogadores.criar(db, g.id, { ...dados, apelido: 'Beltrano', pontuacaoInicial: 0 }, HOJE)),
  );
  if (!outro.ok) throw new Error('inalcançável');
  exigir(await como((db) => jogadores.excluir(db, g.id, outro.id)));

  const [habilidade] = (
    await b.owner.query<{ id: string }>('SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem', [g.id])
  ).rows;
  exigir(await como((db) => habilidades.excluir(db, g.id, habilidade!.id)));

  expect(await como((db) => grupos.arquivar(db, g.id, DADOS_GRUPO.nome))).toBe('ok');
  expect(await como((db) => grupos.reativar(db, g.id))).toBe('ok');

  return (
    await b.owner.query<Linha>('SELECT acao, resumo FROM auditoria WHERE grupo_id = $1 ORDER BY momento, id', [g.id])
  ).rows;
}

describe('auditoria da feature (T50; GEL-113)', () => {
  it('cada evento da spec é gravado pela escrita que o gera', async () => {
    const linhas = await percorrerAFeature();
    expect([...new Set(linhas.map((l) => l.acao))].sort()).toEqual([...EVENTOS].sort());
  });

  it('nenhum resumo contém o telefone nem o ano de nascimento', async () => {
    const linhas = await percorrerAFeature();
    expect(linhas.length).toBeGreaterThanOrEqual(EVENTOS.length);
    for (const l of linhas) {
      const texto = JSON.stringify(l.resumo ?? {});
      expect(texto, l.acao).not.toContain(TELEFONE);
      expect(texto, l.acao).not.toContain(String(ANO));
    }
  });

  it('o resumo só tem ids, datas, números ou nulos (nada de texto livre)', async () => {
    const linhas = await percorrerAFeature();
    for (const l of linhas) {
      const resumo = (l.resumo ?? {}) as Record<string, unknown>;
      expect(typeof resumo, l.acao).toBe('object');
      for (const [chave, valor] of Object.entries(resumo)) {
        const permitido =
          valor === null ||
          typeof valor === 'number' ||
          (typeof valor === 'string' && (UUID.test(valor) || DATA.test(valor)));
        expect(permitido, `${l.acao}.${chave} = ${JSON.stringify(valor)}`).toBe(true);
      }
    }
  });
});
