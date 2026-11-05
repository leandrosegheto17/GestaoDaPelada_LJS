import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contas, links } from '../../src/infraestrutura/db/repositorios/contas.ts';
import { encerrarAtual } from '../../src/infraestrutura/db/repositorios/sessoes.ts';
import {
  abrirCenarioConta,
  criarLink,
  criarSessao,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comDb, hashAleatorio } from './apoio.ts';

/**
 * Repositórios de contas, sessões e links (T22; ACE-18). Contra um banco `teste_*` migrado com
 * o cenário de conta; cada caso roda numa transação como `pelada_app`, desfeita no fim.
 */

let aberto: CenarioContaAberto;
let grupoArquivado: string;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  const { db, cenario } = aberto;
  // Grupo arquivado criado por A, com B também admin: B não o vê, A vê.
  const r = await db.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
     VALUES ('Grupo Arquivado', 'grupo-arquivado', 'sabado', 'semanal', '09:00', $1, now(), now()) RETURNING id`,
    [cenario.contaA],
  );
  grupoArquivado = r.rows[0]!.id;
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
     VALUES ($1, $3, true, $1, now()), ($2, $3, false, $1, now())`,
    [cenario.contaA, cenario.contaB, grupoArquivado],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('contas.eu', () => {
  it('ACE-18: devolve id, nome, e-mail e os grupos com id, nome, slug e acessa_financeiro', async () => {
    const { url, cenario } = aberto;
    const eu = await comDb(url, cenario.contaA, (db) => contas.eu(db));
    expect(eu).toMatchObject({ id: cenario.contaA, nome: 'Conta A', email: cenario.emailA });
    const grupoA = eu?.grupos.find((g) => g.id === cenario.grupoA);
    expect(grupoA).toEqual({
      id: cenario.grupoA,
      nome: 'Grupo A',
      slug: cenario.slugA,
      acessa_financeiro: false,
    });
    for (const g of eu?.grupos ?? [])
      expect(Object.keys(g).sort()).toEqual(['acessa_financeiro', 'id', 'nome', 'slug']);
  });

  it('ACE-18: não lista o grupo de outra conta nem o grupo arquivado de outra criadora', async () => {
    const { url, cenario } = aberto;
    const eu = await comDb(url, cenario.contaB, (db) => contas.eu(db));
    const ids = eu?.grupos.map((g) => g.id) ?? [];
    expect(ids).toContain(cenario.grupoB);
    expect(ids).not.toContain(cenario.grupoA);
    expect(ids).not.toContain(grupoArquivado);
  });

  it('ACE-18: a criadora ainda vê o próprio grupo arquivado', async () => {
    const { url, cenario } = aberto;
    const eu = await comDb(url, cenario.contaA, (db) => contas.eu(db));
    expect(eu?.grupos.map((g) => g.id)).toContain(grupoArquivado);
  });

  it('ACE-18: sem conta no contexto, nulo', async () => {
    const { url } = aberto;
    expect(await comDb(url, null, (db) => contas.eu(db))).toBeNull();
  });

  it('ACE-18: conta sem vínculo devolve a lista de grupos vazia', async () => {
    const { url, cenario } = aberto;
    const eu = await comDb(url, cenario.contaSemVinculo, (db) => contas.eu(db));
    expect(eu?.grupos).toEqual([]);
  });
});

describe('contas: resultados tipados', () => {
  it('cadastrar: e-mail novo dá nova; e-mail existente dá existente com a mesma conta', async () => {
    const { url, cenario } = aberto;
    await comDb(url, null, async (db) => {
      const nova = await contas.cadastrar(db, {
        email: 'nova@exemplo.test',
        nome: 'Nova',
        senha: 'senha nova 123',
        termosVersao: '2026-11-05',
        tokenHash: hashAleatorio(),
      });
      expect(nova).toMatchObject({ situacao: 'nova', enviar: true });
      expect(typeof nova.contaId).toBe('string');
      const existente = await contas.cadastrar(db, {
        email: cenario.emailA,
        nome: 'Outra',
        senha: 'outra senha 123',
        termosVersao: '2026-11-05',
        tokenHash: hashAleatorio(),
      });
      expect(existente).toMatchObject({ situacao: 'existente', contaId: cenario.contaA });
    });
  });

  it('entrar: ok com conta e nome; invalida; nao_confirmado; bloqueado depois de 5 falhas', async () => {
    const { url, cenario } = aberto;
    await comDb(url, null, async (db) => {
      const ip = hashAleatorio();
      const ok = await contas.entrar(db, {
        email: cenario.emailA,
        senha: cenario.senhaA,
        ipHash: ip,
        tokenHash: hashAleatorio(),
      });
      expect(ok).toEqual({ resultado: 'ok', contaId: cenario.contaA, nome: 'Conta A' });

      const naoConfirmado = await contas.entrar(db, {
        email: cenario.emailNaoConfirmada,
        senha: cenario.senhaNaoConfirmada,
        ipHash: ip,
        tokenHash: hashAleatorio(),
      });
      expect(naoConfirmado).toEqual({ resultado: 'nao_confirmado' });

      for (let i = 0; i < 4; i += 1) {
        const invalida = await contas.entrar(db, {
          email: cenario.emailB,
          senha: 'errada',
          ipHash: ip,
          tokenHash: hashAleatorio(),
        });
        expect(invalida).toEqual({ resultado: 'invalida' });
      }
      await contas.entrar(db, {
        email: cenario.emailB,
        senha: 'errada',
        ipHash: ip,
        tokenHash: hashAleatorio(),
      });
      const bloqueado = await contas.entrar(db, {
        email: cenario.emailB,
        senha: cenario.senhaB,
        ipHash: ip,
        tokenHash: hashAleatorio(),
      });
      expect(bloqueado.resultado).toBe('bloqueado');
      if (bloqueado.resultado === 'bloqueado') expect(bloqueado.bloqueadoAte).toBeInstanceOf(Date);
    });
  });

  it('trocarSenha: ok, senha_incorreta e bloqueado depois de 5 senhas atuais erradas', async () => {
    const { url, db: admin, cenario } = aberto;
    const sessao = await criarSessao(admin, cenario.contaB);
    await comDb(url, cenario.contaB, async (db) => {
      expect(
        await contas.trocarSenha(db, {
          senhaAtual: 'errada',
          senhaNova: 'nova senha 123',
          tokenHash: sessao.hash,
        }),
      ).toBe('senha_incorreta');
      for (let i = 0; i < 4; i += 1) {
        await contas.trocarSenha(db, {
          senhaAtual: 'errada',
          senhaNova: 'nova senha 123',
          tokenHash: sessao.hash,
        });
      }
      expect(
        await contas.trocarSenha(db, {
          senhaAtual: cenario.senhaB,
          senhaNova: 'nova senha 123',
          tokenHash: sessao.hash,
        }),
      ).toBe('bloqueado');
    });
    await comDb(url, cenario.contaB, async (db) => {
      expect(
        await contas.trocarSenha(db, {
          senhaAtual: cenario.senhaB,
          senhaNova: 'nova senha 123',
          tokenHash: sessao.hash,
        }),
      ).toBe('ok');
    });
  });

  it('excluir: senha_incorreta, unico_admin com a lista e ok', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaA, async (db) => {
      expect(await contas.excluir(db, 'errada')).toEqual({ resultado: 'senha_incorreta' });
    });
    await comDb(url, cenario.contaA, async (db) => {
      const r = await contas.excluir(db, cenario.senhaA);
      expect(r.resultado).toBe('unico_admin');
      if (r.resultado === 'unico_admin')
        expect(r.grupos).toContainEqual({ id: cenario.grupoA, nome: 'Grupo A' });
    });
    await comDb(url, cenario.contaNaoConfirmada, async (db) => {
      expect(await contas.excluir(db, cenario.senhaNaoConfirmada)).toEqual({ resultado: 'ok' });
    });
  });
});

describe('sessoes.encerrarAtual', () => {
  it('ACE-17: apaga a sessão da própria conta; a de outra conta fica (RLS)', async () => {
    const { url, db: admin, cenario } = aberto;
    const deA = await criarSessao(admin, cenario.contaA);
    const deB = await criarSessao(admin, cenario.contaB);
    await comDb(url, cenario.contaA, async (db) => {
      expect(await encerrarAtual(db, deB.hash)).toBe(false);
      expect(await encerrarAtual(db, deA.hash)).toBe(true);
    });
  });
});

describe('links: resultados tipados', () => {
  it('pedir: conta não confirmada recebe enviar e confirmada falso; e-mail sem conta, enviar falso', async () => {
    const { url, cenario } = aberto;
    await comDb(url, null, async (db) => {
      expect(
        await links.pedir(db, cenario.emailNaoConfirmada, 'confirmacao', hashAleatorio()),
      ).toMatchObject({
        enviar: true,
        confirmada: false,
      });
      expect(await links.pedir(db, 'ninguem@exemplo.test', 'recuperacao', hashAleatorio())).toEqual(
        {
          enviar: false,
          nome: null,
          confirmada: false,
        },
      );
      expect(await links.pedir(db, cenario.emailA, 'recuperacao', hashAleatorio())).toMatchObject({
        enviar: true,
        nome: 'Conta A',
        confirmada: true,
      });
    });
  });

  it('confirmar: link válido devolve a conta; inexistente, nulo', async () => {
    const { url, db: admin, cenario } = aberto;
    const link = await criarLink(admin, cenario.contaNaoConfirmada, 'confirmacao');
    await comDb(url, null, async (db) => {
      expect(await links.confirmar(db, link.hash)).toBe(cenario.contaNaoConfirmada);
      expect(await links.confirmar(db, hashAleatorio())).toBeNull();
    });
  });

  it('novaSenha: link válido dá verdadeiro; inexistente ou usado, falso', async () => {
    const { url, db: admin, cenario } = aberto;
    const link = await criarLink(admin, cenario.contaB, 'recuperacao');
    await comDb(url, null, async (db) => {
      expect(await links.novaSenha(db, link.hash, 'senha recuperada 123')).toBe(true);
      expect(await links.novaSenha(db, link.hash, 'outra senha 123')).toBe(false);
      expect(await links.novaSenha(db, hashAleatorio(), 'outra senha 123')).toBe(false);
    });
  });
});

describe('repositórios de conta', () => {
  it('ACE-43, ACE-63: nenhum repositório lê senha_hash nem e_dono', () => {
    const pasta = fileURLToPath(
      new URL('../../src/infraestrutura/db/repositorios/', import.meta.url),
    );
    for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.ts'))) {
      const fonte = readFileSync(`${pasta}${arquivo}`, 'utf8');
      expect(fonte, arquivo).not.toMatch(/senha_hash|\be_dono\b/);
    }
  });
});
