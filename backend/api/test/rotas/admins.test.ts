import { adminsResposta } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { GRUPO_A, GRUPO_B } from '../apoio/cenario-dois-grupos.ts';
import { GRUPO_ISOLADO } from '../apoio/grupo-isolado.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao } from '../apoio/sessao-worker.ts';

// Rotas de admins do grupo (design C4; ACE-31, ACE-32, ACE-37 a ACE-42).

const { pedir, remetente, tokenDoEmail } = cenarioDeAcesso();
const emailNovo = () => `convite-${crypto.randomUUID()}@exemplo.com`;
const raiz = (g: { grupo: string }) => `/api/grupos/${g.grupo}/admins`;

const auditoriaDe = (grupoId: string, acao: string, entidadeId: string) =>
  comoOwner<{ autor_conta_id: string }>(
    'SELECT autor_conta_id FROM auditoria WHERE grupo_id = $1 AND acao = $2 AND entidade_id = $3',
    [grupoId, acao, entidadeId],
  );

describe('POST /api/grupos/:grupoId/admins/convites', () => {
  it('convida: 201 com o convite, manda o e-mail com o link e grava a auditoria (ACE-31, ACE-42)', async () => {
    const s = await criarSessao(GRUPO_A);
    const email = emailNovo();
    const r = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email }, { cookie: s.cookie });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ id: expect.any(String), email, expiraEm: expect.stringMatching(/^\d{4}-/) });

    const mensagem = remetente.mensagens.find((m) => m.para === email);
    expect(mensagem?.assunto).toContain('Grupo grupo-a');
    expect(mensagem?.texto).toContain('/convite#t=');
    // O link enviado abre o convite.
    const ler = await pedir('POST', '/api/convites/ler', { token: tokenDoEmail(email) });
    expect(ler.corpo).toEqual({ email, grupoNome: 'Grupo grupo-a', contaExiste: false });

    const id = (r.corpo as { id: string }).id;
    expect(await auditoriaDe(GRUPO_A.grupo, 'convidar_admin', id)).toEqual([{ autor_conta_id: s.contaId }]);
  });

  it('e-mail que já é admin do grupo: 409 ja_e_admin e nenhum e-mail (ACE-32)', async () => {
    const s = await criarSessao(GRUPO_A);
    const antes = remetente.mensagens.length;
    const r = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email: s.email }, { cookie: s.cookie });
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'ja_e_admin' } });
    expect(remetente.mensagens).toHaveLength(antes);
  });

  it('remetente que falha: 503 email_indisponivel e o convite não fica (ACE-52)', async () => {
    const s = await criarSessao(GRUPO_A);
    const email = emailNovo();
    const falha = await pedir(
      'POST',
      `${raiz(GRUPO_A)}/convites`,
      { email },
      { cookie: s.cookie, remetente: { enviar: () => Promise.resolve('falhou') } },
    );
    expect(falha.status).toBe(503);
    const lista = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: s.cookie });
    expect((lista.corpo as { convites: { email: string }[] }).convites.map((c) => c.email)).not.toContain(email);
    // Pedir de novo funciona.
    expect((await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email }, { cookie: s.cookie })).status).toBe(201);
  });

  it('e-mail inválido: 422', async () => {
    const s = await criarSessao(GRUPO_A);
    const r = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email: 'x' }, { cookie: s.cookie });
    expect(r.status).toBe(422);
  });
});

describe('GET /api/grupos/:grupoId/admins', () => {
  it('lista os admins (id, nome, e-mail, acessaFinanceiro) e os convites pendentes (ACE-37)', async () => {
    const s = await criarSessao(GRUPO_A);
    const email = emailNovo();
    const convite = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email }, { cookie: s.cookie });
    const r = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(adminsResposta.safeParse(r.corpo).success).toBe(true);
    const corpo = r.corpo as { admins: { id: string }[]; convites: { id: string; email: string }[] };
    expect(r.corpo).toMatchObject({
      admins: expect.arrayContaining([
        { id: GRUPO_A.conta, nome: 'grupo-a', email: 'grupo-a@exemplo.com', acessaFinanceiro: false },
        { id: s.contaId, nome: 'Pessoa Convidada', email: s.email, acessaFinanceiro: false },
      ]),
    });
    expect(corpo.admins.map((a) => a.id)).not.toContain(GRUPO_B.conta);
    expect(corpo.convites).toContainEqual({
      id: (convite.corpo as { id: string }).id,
      email,
      expiraEm: expect.any(String),
    });
  });

  it('conta de outro grupo, sem vínculo: 404, igual a um grupo que não existe (ACE-41)', async () => {
    const s = await criarSessao(GRUPO_B);
    const semVinculo = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: s.cookie });
    const inexistente = await pedir('GET', `/api/grupos/${crypto.randomUUID()}/admins`, undefined, {
      cookie: s.cookie,
    });
    expect(semVinculo.status).toBe(404);
    expect(semVinculo.corpo).toEqual(inexistente.corpo);
  });

  it('as escritas de quem não tem vínculo também dão 404 e nada muda (ACE-41)', async () => {
    const intruso = await criarSessao(GRUPO_B);
    const admin = await criarSessao(GRUPO_A);
    const convite = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email: emailNovo() }, { cookie: admin.cookie });
    const idConvite = (convite.corpo as { id: string }).id;

    const tentativas = [
      pedir('POST', `${raiz(GRUPO_A)}/convites`, { email: emailNovo() }, { cookie: intruso.cookie }),
      pedir('DELETE', `${raiz(GRUPO_A)}/convites/${idConvite}`, undefined, { cookie: intruso.cookie }),
      pedir('DELETE', `${raiz(GRUPO_A)}/${admin.contaId}`, undefined, { cookie: intruso.cookie }),
    ];
    for (const r of await Promise.all(tentativas)) expect(r.status).toBe(404);
    const lista = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: admin.cookie });
    const corpo = lista.corpo as { admins: { id: string }[]; convites: { id: string }[] };
    expect(corpo.admins.map((a) => a.id)).toContain(admin.contaId);
    expect(corpo.convites.map((c) => c.id)).toContain(idConvite);
  });

  it('sem sessão: 401', async () => {
    const r = await pedir('GET', raiz(GRUPO_A));
    expect(r.status).toBe(401);
  });
});

describe('DELETE /api/grupos/:grupoId/admins/convites/:id', () => {
  it('cancela o convite pendente: 204, o link deixa de valer e a auditoria é gravada (ACE-38, ACE-42)', async () => {
    const s = await criarSessao(GRUPO_A);
    const email = emailNovo();
    const convite = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email }, { cookie: s.cookie });
    const id = (convite.corpo as { id: string }).id;

    const r = await pedir('DELETE', `${raiz(GRUPO_A)}/convites/${id}`, undefined, { cookie: s.cookie });
    expect(r.status).toBe(204);
    expect((await pedir('POST', '/api/convites/ler', { token: tokenDoEmail(email) })).status).toBe(410);
    const lista = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: s.cookie });
    expect((lista.corpo as { convites: { id: string }[] }).convites.map((c) => c.id)).not.toContain(id);
    expect(await auditoriaDe(GRUPO_A.grupo, 'cancelar_convite', id)).toEqual([{ autor_conta_id: s.contaId }]);
  });

  it('convite que não existe, já cancelado ou id mal formado: 404', async () => {
    const s = await criarSessao(GRUPO_A);
    const convite = await pedir('POST', `${raiz(GRUPO_A)}/convites`, { email: emailNovo() }, { cookie: s.cookie });
    const id = (convite.corpo as { id: string }).id;
    await pedir('DELETE', `${raiz(GRUPO_A)}/convites/${id}`, undefined, { cookie: s.cookie });
    for (const alvo of [id, crypto.randomUUID(), 'nao-e-uuid']) {
      const r = await pedir('DELETE', `${raiz(GRUPO_A)}/convites/${alvo}`, undefined, { cookie: s.cookie });
      expect(r.status).toBe(404);
    }
  });
});

describe('DELETE /api/grupos/:grupoId/admins/:contaId', () => {
  it('remove outro admin: 204, apaga o vínculo e grava a auditoria (ACE-39, ACE-42)', async () => {
    const quemRemove = await criarSessao(GRUPO_A);
    const removido = await criarSessao(GRUPO_A);
    const r = await pedir('DELETE', `${raiz(GRUPO_A)}/${removido.contaId}`, undefined, { cookie: quemRemove.cookie });
    expect(r.status).toBe(204);

    const lista = await pedir('GET', raiz(GRUPO_A), undefined, { cookie: quemRemove.cookie });
    expect((lista.corpo as { admins: { id: string }[] }).admins.map((a) => a.id)).not.toContain(removido.contaId);
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: removido.cookie });
    expect(eu.corpo).toMatchObject({ grupos: [] });
    expect(await auditoriaDe(GRUPO_A.grupo, 'remover_admin', removido.contaId)).toEqual([
      { autor_conta_id: quemRemove.contaId },
    ]);
  });

  it('o último admin não sai: 409 ultimo_admin e o vínculo fica (ACE-40)', async () => {
    // O grupo isolado só tem a conta fundadora; a conta convidada vira a segunda e remove a fundadora, ficando só.
    const s = await criarSessao(GRUPO_ISOLADO);
    const removeFundadora = await pedir('DELETE', `${raiz(GRUPO_ISOLADO)}/${GRUPO_ISOLADO.conta}`, undefined, {
      cookie: s.cookie,
    });
    expect(removeFundadora.status).toBe(204);

    const r = await pedir('DELETE', `${raiz(GRUPO_ISOLADO)}/${s.contaId}`, undefined, { cookie: s.cookie });
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'ultimo_admin' } });
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(eu.corpo).toMatchObject({ grupos: [{ id: GRUPO_ISOLADO.grupo }] });
  });

  it('conta que não é admin do grupo ou id mal formado: 404', async () => {
    const s = await criarSessao(GRUPO_A);
    for (const alvo of [crypto.randomUUID(), GRUPO_B.conta, 'nao-e-uuid']) {
      const r = await pedir('DELETE', `${raiz(GRUPO_A)}/${alvo}`, undefined, { cookie: s.cookie });
      expect(r.status).toBe(404);
    }
  });
});
