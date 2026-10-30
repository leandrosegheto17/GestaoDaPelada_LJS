import { TERMOS_VERSAO } from '@pelada/contrato';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import * as convites from '../../src/infraestrutura/db/repositorios/convites.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cenarioDeAcesso, cookieDaResposta, SENHA } from '../apoio/acesso.ts';
import { GRUPO_A, GRUPO_B } from '../apoio/cenario-dois-grupos.ts';
import { capturarLog } from '../apoio/log.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, noBanco } from '../apoio/sessao-worker.ts';

// Rotas de convite vistas por quem recebe (design C4; ACE-33 a ACE-36).

const { pedir } = cenarioDeAcesso();

/** Convite pendente criado pela conta fundadora do grupo; devolve o token do link. */
async function convidar(grupo: typeof GRUPO_A, email: string) {
  const link = await gerarToken();
  const criado = await noBanco(grupo.conta, (db) => convites.criar(db, grupo.grupo, email, link.hash));
  expect(criado.resultado).toBe('ok');
  return { token: link.token, hash: link.hash, id: criado.conviteId as string };
}
const emailNovo = () => `convidada-${crypto.randomUUID()}@exemplo.com`;

describe('POST /api/convites/ler', () => {
  it('devolve o nome do grupo, o e-mail do convite e se a conta existe, sem sessão (ACE-33, ACE-34)', async () => {
    const email = emailNovo();
    const { token } = await convidar(GRUPO_A, email);
    const r = await pedir('POST', '/api/convites/ler', { token });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ email, grupoNome: 'Grupo grupo-a', contaExiste: false });
  });

  it('e-mail que já tem conta: contaExiste verdadeiro', async () => {
    const s = await criarSessao();
    const { token } = await convidar(GRUPO_B, s.email);
    const r = await pedir('POST', '/api/convites/ler', { token });
    expect(r.corpo).toMatchObject({ email: s.email, contaExiste: true });
  });

  it('convite cancelado ou que não existe: 410 link_invalido (ACE-36)', async () => {
    const { token, id } = await convidar(GRUPO_A, emailNovo());
    await noBanco(GRUPO_A.conta, (db) => convites.cancelar(db, GRUPO_A.grupo, id));
    for (const t of [token, 'k'.repeat(43)]) {
      const r = await pedir('POST', '/api/convites/ler', { token: t });
      expect(r.status).toBe(410);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });
    }
  });
});

describe('POST /api/convites/aceitar', () => {
  it('a conta do e-mail do convite aceita e passa a ter o vínculo no grupo (ACE-33)', async () => {
    const s = await criarSessao();
    const { token } = await convidar(GRUPO_A, s.email);
    const r = await pedir('POST', '/api/convites/aceitar', { token }, { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ grupoId: GRUPO_A.grupo });

    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(eu.corpo).toMatchObject({
      grupos: [{ id: GRUPO_A.grupo, slug: 'grupo-a', acessaFinanceiro: false }],
    });
  });

  it('convite enviado a outro e-mail: 403 convite_de_outro_email e nenhum vínculo (ACE-35)', async () => {
    const s = await criarSessao();
    const { token } = await convidar(GRUPO_A, emailNovo());
    const r = await pedir('POST', '/api/convites/aceitar', { token }, { cookie: s.cookie });
    expect(r.status).toBe(403);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'convite_de_outro_email' } });
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(eu.corpo).toMatchObject({ grupos: [] });
  });

  it('convite já usado ou que não existe: 410 link_invalido (ACE-36)', async () => {
    const s = await criarSessao();
    const { token } = await convidar(GRUPO_A, s.email);
    expect((await pedir('POST', '/api/convites/aceitar', { token }, { cookie: s.cookie })).status).toBe(200);
    for (const t of [token, 'k'.repeat(43)]) {
      const r = await pedir('POST', '/api/convites/aceitar', { token: t }, { cookie: s.cookie });
      expect(r.status).toBe(410);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });
    }
  });

  it('sem sessão: 401 sessao_expirada', async () => {
    const { token } = await convidar(GRUPO_A, emailNovo());
    const r = await pedir('POST', '/api/convites/aceitar', { token });
    expect(r.status).toBe(401);
  });
});

describe('POST /api/convites/cadastrar', () => {
  const corpo = (token: string, extra: Record<string, unknown> = {}) => ({
    token,
    nome: 'Pessoa Convidada',
    senha: SENHA,
    termos: true,
    ...extra,
  });

  it('cria a conta confirmada, abre a sessão e o grupo aparece em GET /api/sessao (ACE-34)', async () => {
    const email = emailNovo();
    const { token } = await convidar(GRUPO_A, email);
    const r = await pedir('POST', '/api/convites/cadastrar', corpo(token));
    expect(r.status).toBe(201);
    expect(r.corpo).toEqual({ grupoId: GRUPO_A.grupo });

    const cookie = cookieDaResposta(r);
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie });
    expect(eu.corpo).toMatchObject({
      email,
      nome: 'Pessoa Convidada',
      grupos: [{ id: GRUPO_A.grupo }],
    });
    // O e-mail nasce confirmado: dá para entrar sem passar pelo link.
    expect((await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA })).status).toBe(200);
    // Grava a versão dos termos vigente e a hora do aceite (ACE-58).
    const [conta] = await comoOwner<{ termos_versao: string; termos_aceitos_em: Date | null }>(
      'select termos_versao, termos_aceitos_em from contas where email = $1',
      [email],
    );
    expect(conta?.termos_versao).toBe(TERMOS_VERSAO);
    expect(conta?.termos_aceitos_em).not.toBeNull();
  });

  it('convite usado, cancelado ou que não existe: 410 link_invalido, sem sessão (ACE-36)', async () => {
    const { token } = await convidar(GRUPO_A, emailNovo());
    expect((await pedir('POST', '/api/convites/cadastrar', corpo(token))).status).toBe(201);
    const usado = await pedir('POST', '/api/convites/cadastrar', corpo(token));
    expect(usado.status).toBe(410);
    expect(usado.headers.get('Set-Cookie')).toBeNull();

    const cancelado = await convidar(GRUPO_A, emailNovo());
    await noBanco(GRUPO_A.conta, (db) => convites.cancelar(db, GRUPO_A.grupo, cancelado.id));
    expect((await pedir('POST', '/api/convites/cadastrar', corpo(cancelado.token))).status).toBe(410);
    expect((await pedir('POST', '/api/convites/cadastrar', corpo('k'.repeat(43)))).status).toBe(410);
  });

  it('e-mail que já tem conta: 409 conta_existente e o convite segue valendo', async () => {
    const s = await criarSessao();
    const { token } = await convidar(GRUPO_A, s.email);
    const r = await pedir('POST', '/api/convites/cadastrar', corpo(token));
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'conta_existente' } });
    expect((await pedir('POST', '/api/convites/ler', { token })).status).toBe(200);
  });

  it('sem o aceite dos termos: 422 termos_obrigatorios; senha fora do limite: 422 dados_invalidos', async () => {
    const { token } = await convidar(GRUPO_A, emailNovo());
    const semTermos = await pedir('POST', '/api/convites/cadastrar', corpo(token, { termos: false }));
    expect(semTermos.status).toBe(422);
    expect(semTermos.corpo).toMatchObject({ erro: { codigo: 'termos_obrigatorios' } });
    const curta = await pedir('POST', '/api/convites/cadastrar', corpo(token, { senha: 'curta' }));
    expect(curta.status).toBe(422);
    expect(curta.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos' } });
    // O convite continua valendo depois das recusas.
    expect((await pedir('POST', '/api/convites/cadastrar', corpo(token))).status).toBe(201);
  });

  it('o log não contém o token do convite nem a senha (ACE-21)', async () => {
    const { token } = await convidar(GRUPO_A, emailNovo());
    const { log } = await capturarLog(() =>
      pedir('POST', '/api/convites/cadastrar', corpo(token, { senha: 'senha-vazada-do-convite' })),
    );
    expect(log).not.toContain(token);
    expect(log).not.toContain('senha-vazada-do-convite');
  });
});

describe('convite de grupo arquivado (T76; SEC-004)', () => {
  /** Grupo criado pela conta de uma sessão nova, com um convite pendente ao e-mail dado; arquivado no fim. */
  async function grupoArquivadoComConvite(email: string) {
    const criadora = await criarSessao();
    const grupo = await noBanco(criadora.contaId, async (db) => {
      const { rows } = await sql<{ id: string }>`
        SELECT id FROM grupo_criar('Grupo Convite Arquivado', 'quarta', 'semanal', '20:00',
                                   ${`conv-arq-${crypto.randomUUID()}`}, ARRAY['Passe']::text[])
      `.execute(db);
      return rows[0]?.id as string;
    });
    const link = await gerarToken();
    const criado = await noBanco(criadora.contaId, (db) => convites.criar(db, grupo, email, link.hash));
    expect(criado.resultado).toBe('ok');
    await noBanco(criadora.contaId, (db) =>
      db
        .updateTable('grupos')
        .set({ arquivado_em: sql<Date>`now()` })
        .where('id', '=', grupo)
        .execute(),
    );
    return { criadora, grupo, token: link.token, id: criado.conviteId as string };
  }

  const vinculosDe = (grupo: string) =>
    comoOwner<{ conta_id: string }>('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1', [grupo]);

  it('ler e aceitar: 410 link_invalido e nenhum vínculo novo', async () => {
    const convidada = await criarSessao();
    const { criadora, grupo, token } = await grupoArquivadoComConvite(convidada.email);

    const lido = await pedir('POST', '/api/convites/ler', { token });
    expect(lido.status).toBe(410);
    expect(lido.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });
    const aceito = await pedir('POST', '/api/convites/aceitar', { token }, { cookie: convidada.cookie });
    expect(aceito.status).toBe(410);
    expect(aceito.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });

    expect((await vinculosDe(grupo)).map((v) => v.conta_id)).toEqual([criadora.contaId]);
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: convidada.cookie });
    expect(eu.corpo).toMatchObject({ grupos: [] });
  });

  it('cadastrar: 410 link_invalido, sem conta e sem sessão', async () => {
    const email = emailNovo();
    const { grupo, token } = await grupoArquivadoComConvite(email);
    const r = await pedir('POST', '/api/convites/cadastrar', { token, nome: 'Pessoa', senha: SENHA, termos: true });
    expect(r.status).toBe(410);
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(await comoOwner('SELECT 1 FROM contas WHERE email = $1', [email])).toEqual([]);
    expect(await vinculosDe(grupo)).toHaveLength(1);
  });

  it('a criadora cancela o convite pendente do grupo arquivado: 204, e ele não volta ao reativar', async () => {
    const convidada = await criarSessao();
    const { criadora, grupo, token, id } = await grupoArquivadoComConvite(convidada.email);

    const r = await pedir('DELETE', `/api/grupos/${grupo}/admins/convites/${id}`, undefined, {
      cookie: criadora.cookie,
    });
    expect(r.status).toBe(204);
    expect(
      await comoOwner('SELECT 1 FROM convites_admin WHERE id = $1 AND cancelado_em IS NOT NULL', [id]),
    ).toHaveLength(1);

    expect((await pedir('POST', `/api/grupos/${grupo}/reativar`, undefined, { cookie: criadora.cookie })).status).toBe(
      200,
    );
    expect((await pedir('POST', '/api/convites/ler', { token })).status).toBe(410);
  });

  it('cancelar de novo, ou um convite que não existe, no grupo arquivado: 404', async () => {
    const { criadora, grupo, id } = await grupoArquivadoComConvite(emailNovo());
    const url = (c: string) => `/api/grupos/${grupo}/admins/convites/${c}`;
    expect((await pedir('DELETE', url(id), undefined, { cookie: criadora.cookie })).status).toBe(204);
    expect((await pedir('DELETE', url(id), undefined, { cookie: criadora.cookie })).status).toBe(404);
    expect((await pedir('DELETE', url(crypto.randomUUID()), undefined, { cookie: criadora.cookie })).status).toBe(404);
  });

  it('as outras escritas de admins continuam 409 no grupo arquivado', async () => {
    const { criadora, grupo } = await grupoArquivadoComConvite(emailNovo());
    const convidar = await pedir(
      'POST',
      `/api/grupos/${grupo}/admins/convites`,
      { email: emailNovo() },
      { cookie: criadora.cookie },
    );
    expect(convidar.status).toBe(409);
    expect(convidar.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
  });

  it('reativado o grupo, o convite volta a valer: lê e aceita', async () => {
    const convidada = await criarSessao();
    const { criadora, grupo, token } = await grupoArquivadoComConvite(convidada.email);
    expect((await pedir('POST', `/api/grupos/${grupo}/reativar`, undefined, { cookie: criadora.cookie })).status).toBe(
      200,
    );

    const lido = await pedir('POST', '/api/convites/ler', { token });
    expect(lido.status).toBe(200);
    expect(lido.corpo).toEqual({ email: convidada.email, grupoNome: 'Grupo Convite Arquivado', contaExiste: true });
    const aceito = await pedir('POST', '/api/convites/aceitar', { token }, { cookie: convidada.cookie });
    expect(aceito.status).toBe(200);
    expect(aceito.corpo).toEqual({ grupoId: grupo });
  });
});
