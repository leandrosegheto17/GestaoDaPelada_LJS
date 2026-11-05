import { sql } from 'kysely';
import { assinaturas } from '../../infraestrutura/db/repositorios/assinaturas.ts';
import { plano } from '../../infraestrutura/db/repositorios/plano.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * Assinatura vigente bloqueia arquivar o grupo e excluir a conta criadora (planos-e-cobranca T38; PLA-68, PLA-69;
 * AD-115): com assinatura `aguardando_pagamento` ou `ativa`, o Asaas seguiria cobrando um grupo arquivado ou de uma
 * conta que não existe mais. As duas leem pela RLS de `assinaturas` (a conta da sessão vê as dos grupos visíveis).
 *
 * - Arquivar: só a criadora arquiva (GEL-24); para quem não criou, a conferência não responde nada e a rota segue para
 *   o `so_quem_criou` de sempre. A trava de assinatura do grupo (AD-097) vem antes: um assinar em curso termina antes
 *   de a conferência ler, e um assinar que chega depois espera o arquivar e vê o grupo arquivado (55000).
 * - Excluir a conta: o grupo mais antigo, entre os que ela criou, com assinatura vigente; o nome vai na mensagem.
 */

/** `true` quando quem pede é a criadora e o grupo tem assinatura pendente ou ativa. */
async function bloqueiaArquivar(db: Db, grupoId: string, conta: string): Promise<boolean> {
  await assinaturas.travarGrupo(db, grupoId);
  const dados = await plano.ler(db, grupoId);
  if (dados === null || dados.criadoPor !== conta) return false;
  return (await assinaturas.pendenteOuAtiva(db, grupoId)) !== null;
}

/** O nome do grupo mais antigo criado pela conta da sessão com assinatura pendente ou ativa, ou `null`. */
async function grupoQueBloqueiaExcluir(db: Db): Promise<string | null> {
  const r = await sql<{ nome: string }>`
    SELECT g.nome
      FROM assinaturas a
      JOIN grupos g ON g.id = a.grupo_id
     WHERE g.criado_por = app_conta_id()
       AND a.situacao IN ('aguardando_pagamento', 'ativa')
     ORDER BY g.criado_em, g.id
     LIMIT 1`.execute(db);
  return r.rows[0]?.nome ?? null;
}

export const assinaturaBloqueia = { bloqueiaArquivar, grupoQueBloqueiaExcluir };
