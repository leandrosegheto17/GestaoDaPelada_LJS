import { sql } from 'kysely';
import type {
  ConfiguracaoAnterior,
  ConfiguracaoVigente,
  PesosCorpo,
  PesosPainel,
} from '@pelada/contrato';
import { vespera } from '@pelada/dominio';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Configuração de pesos do grupo (T28; PAR-01 a PAR-05, PAR-09, PAR-142; BD:193-194; B:110-114). O `Db` é o da
 * transação da requisição; `hoje` vem do relógio da requisição (o domínio e o banco não leem relógio para a data).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - uma só configuração: é a vigente, e o histórico vem vazio;
 * - várias: a vigente é a de `vigente_desde` mais recente até hoje; cada anterior vale até a véspera da seguinte
 *   (PAR-02), da mais recente para a mais antiga (PAR-01);
 * - salvar quando ainda não há configuração de hoje: insere, audita `pesos_configurados` (PAR-03, PAR-05);
 * - salvar de novo no mesmo dia: substitui a de hoje sem criar linha, audita `pesos_substituidos` (PAR-04, PAR-05);
 * - configuração de ontem ou antes: nunca muda, porque a escrita só atinge `(grupo_id, hoje)` e o grant por coluna
 *   não deixa trocar `vigente_desde` (PAR-09, T25);
 * - falha depois do INSERT (na auditoria): o erro sobe e a transação da requisição desfaz os pesos (PAR-05);
 * - grupo que a conta não vê (outro grupo): a RLS não devolve linha e o painel é nulo (a rota responde 404);
 * - o resumo da auditoria só tem os 6 números (PAR-142).
 *
 * [LACUNA] configuração com `vigente_desde` depois de hoje (relógio adiantado numa gravação anterior): a Base não diz.
 * Interpretação conservadora: o painel a ignora (só considera até hoje) e o salvar de hoje não a toca.
 * [LACUNA] autora sem nome em `contas_nomes_do_grupo` (não deveria ocorrer: a função devolve toda autora de pesos do
 * grupo visível): a Base não diz o texto. Interpretação conservadora: `registradoPor` vazio, sem inventar rótulo.
 */

interface LinhaConfig {
  vigente_desde: string;
  presenca_sem_chuva: number;
  presenca_com_chuva: number;
  lesionado_sem_chuva: number;
  lesionado_com_chuva: number;
  expulso: number;
  expulso_com_chuva: number;
  registrado_por: string;
}

function vigenteDe(c: LinhaConfig, nomes: ReadonlyMap<string, string>): ConfiguracaoVigente {
  return {
    presencaSemChuva: c.presenca_sem_chuva,
    presencaComChuva: c.presenca_com_chuva,
    lesionadoSemChuva: c.lesionado_sem_chuva,
    lesionadoComChuva: c.lesionado_com_chuva,
    expulsoSemChuva: c.expulso,
    expulsoComChuva: c.expulso_com_chuva,
    vigenteDesde: c.vigente_desde,
    registradoPor: nomes.get(c.registrado_por) ?? '',
  };
}

/** Painel de `GET` e `POST /api/grupos/:grupoId/pesos` (PAR-01, PAR-02). Nulo quando a conta não vê o grupo. */
async function painel(db: Db, grupoId: string, hoje: string): Promise<PesosPainel | null> {
  const configs = await sql<LinhaConfig>`
    SELECT vigente_desde::text AS vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
           lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por
      FROM config_pesos
     WHERE grupo_id = ${grupoId} AND vigente_desde <= ${hoje}::date
     ORDER BY vigente_desde DESC`.execute(db);
  const [maisRecente, ...anteriores] = configs.rows;
  if (!maisRecente) return null;

  const autoras = await sql<{ id: string; nome: string }>`
    SELECT id, nome FROM contas_nomes_do_grupo(${grupoId})`.execute(db);
  const nomes = new Map(autoras.rows.map((a) => [a.id, a.nome]));

  // configs.rows está da mais recente para a mais antiga: a seguinte de anteriores[i] é configs.rows[i].
  const historico = anteriores.map((c, i): ConfiguracaoAnterior => ({
    ...vigenteDe(c, nomes),
    vigenteAte: vespera((configs.rows[i] as LinhaConfig).vigente_desde),
  }));
  return { hoje, vigente: vigenteDe(maisRecente, nomes), historico };
}

export interface ResultadoSalvarPesos {
  /** Verdadeiro quando já havia configuração com vigência hoje e ela foi substituída (PAR-04). */
  substituiu: boolean;
}

/**
 * Grava os pesos pela conta da sessão e a auditoria na mesma transação (PAR-03 a PAR-05, PAR-162 a PAR-164; AD-125).
 * - `refletirNoPassado` falso: configuração vigente desde hoje; as anteriores, inclusive a padrão de 1900-01-01,
 *   ficam como estão (PAR-163);
 * - verdadeiro: os 6 pesos de todas as configurações até hoje passam a ser os novos, com as datas intactas, porque a
 *   `pelada_app` não apaga linha nem muda `vigente_desde` (PAR-09, PAR-164). Configuração futura (lacuna acima) não
 *   é tocada, como no painel.
 */
async function salvar(
  db: Db,
  grupoId: string,
  p: PesosCorpo,
  hoje: string,
): Promise<ResultadoSalvarPesos> {
  const substituiu = p.refletirNoPassado
    ? await trocarTodas(db, grupoId, p, hoje)
    : await gravarDeHoje(db, grupoId, p, hoje);

  await auditoria.registrar(db, grupoId, {
    acao: substituiu ? 'pesos_substituidos' : 'pesos_configurados',
    entidade: 'config_pesos',
    entidadeId: hoje,
    resumo: {
      presencaSemChuva: p.presencaSemChuva,
      presencaComChuva: p.presencaComChuva,
      lesionadoSemChuva: p.lesionadoSemChuva,
      lesionadoComChuva: p.lesionadoComChuva,
      expulsoSemChuva: p.expulsoSemChuva,
      expulsoComChuva: p.expulsoComChuva,
    },
  });
  return { substituiu };
}

async function trocarTodas(db: Db, grupoId: string, p: PesosCorpo, hoje: string): Promise<boolean> {
  const r = await sql`
    UPDATE config_pesos
       SET presenca_sem_chuva = ${p.presencaSemChuva},
           presenca_com_chuva = ${p.presencaComChuva},
           lesionado_sem_chuva = ${p.lesionadoSemChuva},
           lesionado_com_chuva = ${p.lesionadoComChuva},
           expulso = ${p.expulsoSemChuva},
           expulso_com_chuva = ${p.expulsoComChuva},
           registrado_por = app_conta_id(),
           registrado_em = now()
     WHERE grupo_id = ${grupoId} AND vigente_desde <= ${hoje}::date`.execute(db);
  // Sem linha atualizada o grupo não é da conta (a RLS filtrou): erro, e a transação da requisição desfaz.
  if (Number(r.numAffectedRows ?? 0) === 0) throw new Error('UPDATE de pesos sem linha');
  return true;
}

async function gravarDeHoje(
  db: Db,
  grupoId: string,
  p: PesosCorpo,
  hoje: string,
): Promise<boolean> {
  // xmax diferente de zero na linha devolvida = o ON CONFLICT atualizou uma linha que já existia.
  const r = await sql<{ substituiu: boolean }>`
    INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                              lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
    VALUES (${grupoId}, ${hoje}::date, ${p.presencaSemChuva}, ${p.presencaComChuva}, ${p.lesionadoSemChuva},
            ${p.lesionadoComChuva}, ${p.expulsoSemChuva}, ${p.expulsoComChuva}, app_conta_id(), now())
    ON CONFLICT (grupo_id, vigente_desde) DO UPDATE
      SET presenca_sem_chuva = EXCLUDED.presenca_sem_chuva,
          presenca_com_chuva = EXCLUDED.presenca_com_chuva,
          lesionado_sem_chuva = EXCLUDED.lesionado_sem_chuva,
          lesionado_com_chuva = EXCLUDED.lesionado_com_chuva,
          expulso = EXCLUDED.expulso,
          expulso_com_chuva = EXCLUDED.expulso_com_chuva,
          registrado_por = EXCLUDED.registrado_por,
          registrado_em = EXCLUDED.registrado_em
    RETURNING (xmax::text <> '0') AS substituiu`.execute(db);
  const substituiu = r.rows[0]?.substituiu;
  if (substituiu === undefined) throw new Error('INSERT de pesos sem linha');
  return substituiu;
}

export const pesos = { painel, salvar };
