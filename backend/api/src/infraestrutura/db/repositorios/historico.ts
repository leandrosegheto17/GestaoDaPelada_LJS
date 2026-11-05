import { sql } from 'kysely';
import type {
  ConfigPesos,
  HistoricoDoGrupo,
  JogadorDoRanking,
  PresencaDoRanking,
} from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Carregador único do histórico do grupo (T27; PAR-62, PAR-77; BD:190-192; AD-035). Ranking, PDF e prévias calculam
 * na leitura sobre o que ele devolve. Serve ao admin (com conta) e ao slug público: quem decide o que se vê é a RLS da
 * transação da requisição, não um filtro daqui. São sempre 4 consultas, qualquer que seja o tamanho do grupo:
 * jogadores com os períodos, partidas até `ate`, as presenças dessas partidas e as configurações de pesos.
 *
 * Do jogador só sai o que o cálculo usa (id, apelido, ano de nascimento, pontuação inicial, início da pontuação e
 * períodos): nada de telefone, posição nem notas (PAR-77). A coluna `expulso` é o peso do expulso sem chuva.
 */

interface LinhaJogador {
  id: string;
  apelido: string;
  ano_nascimento: number | null;
  pontuacao_inicial: number;
  inicio_pontuacao: string | null;
  periodos: Array<{ id: string; inicio: string; fim: string | null }>;
}

interface LinhaPartida {
  id: string;
  data: string;
  choveu: boolean;
}

interface LinhaPresenca {
  partida_id: string;
  jogador_id: string;
  situacao: PresencaDoRanking['situacao'];
}

interface LinhaPesos {
  vigente_desde: string;
  presenca_sem_chuva: number;
  presenca_com_chuva: number;
  lesionado_sem_chuva: number;
  lesionado_com_chuva: number;
  expulso: number;
  expulso_com_chuva: number;
}

async function carregar(db: Db, grupoId: string, ate: string): Promise<HistoricoDoGrupo> {
  const jogadores = await sql<LinhaJogador>`
    SELECT j.id, j.apelido, j.ano_nascimento, j.pontuacao_inicial, j.inicio_pontuacao::text AS inicio_pontuacao,
           coalesce(
             json_agg(json_build_object('id', p.id, 'inicio', p.inicio::text, 'fim', p.fim::text) ORDER BY p.inicio, p.id)
               FILTER (WHERE p.id IS NOT NULL),
             '[]'::json
           ) AS periodos
      FROM jogadores j
      LEFT JOIN periodos_ativos p ON p.jogador_id = j.id AND p.grupo_id = j.grupo_id
     WHERE j.grupo_id = ${grupoId}
     GROUP BY j.id
     ORDER BY j.apelido, j.id`.execute(db);

  const partidas = await sql<LinhaPartida>`
    SELECT id, data::text AS data, choveu
      FROM partidas
     WHERE grupo_id = ${grupoId} AND data <= ${ate}::date
     ORDER BY data`.execute(db);

  const presencas = await sql<LinhaPresenca>`
    SELECT pr.partida_id, pr.jogador_id, pr.situacao
      FROM presencas pr
      JOIN partidas pt ON pt.id = pr.partida_id AND pt.grupo_id = pr.grupo_id
     WHERE pr.grupo_id = ${grupoId} AND pt.data <= ${ate}::date`.execute(db);

  const pesos = await sql<LinhaPesos>`
    SELECT vigente_desde::text AS vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
           lesionado_com_chuva, expulso, expulso_com_chuva
      FROM config_pesos
     WHERE grupo_id = ${grupoId}
     ORDER BY vigente_desde`.execute(db);

  return {
    jogadores: jogadores.rows.map((j): JogadorDoRanking => ({
      id: j.id,
      apelido: j.apelido,
      anoNascimento: j.ano_nascimento,
      periodos: j.periodos,
      pontuacaoInicial: j.pontuacao_inicial,
      inicioPontuacao: j.inicio_pontuacao ?? undefined,
    })),
    partidas: partidas.rows.map((p) => ({ id: p.id, data: p.data, choveu: p.choveu })),
    presencas: presencas.rows.map((p) => ({
      partidaId: p.partida_id,
      jogadorId: p.jogador_id,
      situacao: p.situacao,
    })),
    configsPesos: pesos.rows.map((c): ConfigPesos => ({
      vigenteDesde: c.vigente_desde,
      presencaSemChuva: c.presenca_sem_chuva,
      presencaComChuva: c.presenca_com_chuva,
      lesionadoSemChuva: c.lesionado_sem_chuva,
      lesionadoComChuva: c.lesionado_com_chuva,
      expulsoSemChuva: c.expulso,
      expulsoComChuva: c.expulso_com_chuva,
    })),
  };
}

export const historico = { carregar };
