import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, noBanco, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// exigirGrupoAtivo ligado às rotas de grupo que já existiam (T26; GEL-26): admins e convites.

const { pedir } = cenarioDeAcesso();

/** Grupo da conta (criadora), com uma segunda admin e um convite pendente; arquivado no fim. */
async function grupoArquivado(): Promise<{ s: SessaoDeTeste; grupo: string; outra: SessaoDeTeste; convite: string }> {
  const s = await criarSessao();
  const grupo = await noBanco(s.contaId, async (db) => {
    const { rows } = await sql<{ id: string }>`
      SELECT id FROM grupo_criar('Grupo Rotas Arquivado', 'quarta', 'semanal', '20:00',
                                 ${`rotas-${crypto.randomUUID()}`}, ARRAY['Passe']::text[])
    `.execute(db);
    return rows[0]?.id as string;
  });
  const outra = await criarSessao({
    conta: s.contaId,
    grupo,
    slug: '',
    jogador: '',
    habilidade: '',
    partida: '',
    lancamento: '',
  });
  const r = await pedir(
    'POST',
    `/api/grupos/${grupo}/admins/convites`,
    { email: `pendente-${crypto.randomUUID()}@exemplo.com` },
    { cookie: s.cookie },
  );
  const convite = (r.corpo as { id: string }).id;
  await noBanco(s.contaId, (db) =>
    db
      .updateTable('grupos')
      .set({ arquivado_em: sql<Date>`now()` })
      .where('id', '=', grupo)
      .execute(),
  );
  return { s, grupo, outra, convite };
}

describe('rotas de admins e convites no grupo arquivado (GEL-26)', () => {
  it('escritas → 409 grupo_arquivado e nada muda; GET responde como antes', async () => {
    const { s, grupo, outra, convite } = await grupoArquivado();
    const raiz = `/api/grupos/${grupo}/admins`;

    const convidar = await pedir('POST', `${raiz}/convites`, { email: 'novo@exemplo.com' }, { cookie: s.cookie });
    const cancelar = await pedir('DELETE', `${raiz}/convites/${convite}`, undefined, { cookie: s.cookie });
    const remover = await pedir('DELETE', `${raiz}/${outra.contaId}`, undefined, { cookie: s.cookie });
    for (const r of [convidar, cancelar, remover]) {
      expect(r.status).toBe(409);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
    }

    const lista = await pedir('GET', raiz, undefined, { cookie: s.cookie });
    expect(lista.status).toBe(200);
    const corpo = lista.corpo as { admins: { id: string }[]; convites: { id: string }[] };
    expect(corpo.admins.map((a) => a.id).sort()).toEqual([s.contaId, outra.contaId].sort());
    expect(corpo.convites.map((c) => c.id)).toEqual([convite]);
    expect(
      await comoOwner("SELECT 1 FROM convites_admin WHERE grupo_id = $1 AND email = 'novo@exemplo.com'", [grupo]),
    ).toEqual([]);
  });
});
