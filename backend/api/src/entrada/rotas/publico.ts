import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  consultaMesPublico,
  corpoDoErro,
  eventoPublicoCorpo,
  LIMITE_CORPO_EVENTO_BYTES,
  MENSAGEM_MES_FORA_DO_HISTORICO,
  type LinhaPublica,
  type PdfPublico,
  type RankingPublico,
} from '@pelada/contrato';
import { calcularPdf, calcularRanking, limitesDeMes, mesDe, mesNoHistorico, type LinhaRanking } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, lerCorpoDoGrupo, mensagensDoZod, respostaDeCampo } from '../corpo.ts';
import { eventos } from '../../infraestrutura/db/repositorios/eventos.ts';
import { grupoPublico, type GrupoPublico } from '../../infraestrutura/db/repositorios/grupo-publico.ts';
import { historico } from '../../infraestrutura/db/repositorios/historico.ts';
import { linkPublico } from './grupos.ts';

/** 413 do corpo do evento acima de 1 KB (PAR-128). */
export const MENSAGEM_CORPO_GRANDE = 'O corpo da requisição é grande demais.';

/**
 * Rotas públicas `/api/publico/:slug/*` (partidas-e-ranking T45 em diante; `BD:240-242`). O `protegerRotasPublicas`
 * vem antes (T37): `LIMITE_PUBLICO`, slug no formato (senão 404 sem consulta), conta apagada e transação só com o
 * slug. GET é `READ ONLY`.
 *
 * `GET …/ranking?mes=` (PAR-64 a PAR-66, PAR-76, PAR-77, PAR-90, PAR-93):
 * - grupo pela RLS do slug; sem linha (não existe, arquivado), 404 com o mesmo corpo (PAR-90); reativado, volta (PAR-93);
 * - `mes` fora de `AAAA-MM`: 422 "Mês inválido." no campo `mes` (PAR-65); sem `mes`, o de hoje;
 * - mês fora do histórico (antes do mês da primeira partida, ou depois do de hoje): 422 "Mês fora do histórico do
 *   grupo." (PAR-66); sem partida, só o mês de hoje vale;
 * - a resposta é montada campo a campo pelo `rankingPublico`: nada de id de jogador nem de grupo (PAR-76);
 * - `geradoEm` é o instante do relógio da requisição.
 */

/** O grupo do slug do contexto, ou o 404 do PAR-90 (mesmo corpo para inexistente e arquivado). */
export async function grupoDoSlug(c: Context<Ambiente>): Promise<GrupoPublico | Response> {
  const g = await grupoPublico.lerPeloSlug(c.var.db, c.var.slugPublico ?? '');
  return g ?? c.json(corpoDoErro('nao_encontrado'), 404);
}

/** A linha do domínio na forma pública: sem o `jogadorId` (PAR-76). */
export function linhaPublicaDe(l: LinhaRanking): LinhaPublica {
  return {
    posicao: l.posicao,
    apelido: l.apelido,
    ptsInicial: l.ptsInicial,
    rodadas: l.rodadas.map((r) => ({ situacao: r.situacao, pontos: r.pontos })),
    ptsFinal: l.ptsFinal,
  };
}

export function rotasPublico(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/publico/:slug/ranking', async (c) => {
    const consulta = consultaMesPublico.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupo = await grupoDoSlug(c);
    if (grupo instanceof Response) return grupo;

    const hoje = c.var.relogio.hoje();
    const mes = consulta.data.mes ?? mesDe(hoje);
    const h = await historico.carregar(c.var.db, grupo.id, hoje);
    const r = calcularRanking({ ...h, hoje, mes });
    if (!mesNoHistorico(r.limites, mes)) return respostaDeCampo(c, 'mes', MENSAGEM_MES_FORA_DO_HISTORICO);

    const resposta: RankingPublico = {
      grupo: { nome: grupo.nome, slug: grupo.slug, diaSemana: grupo.diaSemana, frequencia: grupo.frequencia, horario: grupo.horario },
      mes,
      hoje,
      geradoEm: c.var.relogio.agoraIso(),
      navegacao: { mesAnterior: r.navegacao.mesAnterior, mesSeguinte: r.navegacao.mesSeguinte },
      resumoMes: { partidas: r.resumoMes.partidas, comChuva: r.resumoMes.comChuva },
      partidas: r.partidas.map((p) => ({ data: p.data, choveu: p.choveu })),
      linhas: r.linhas.map(linhaPublicaDe),
    };
    return c.json(resposta, 200);
  });

  /**
   * `GET …/pdf?mes=` (T46; PAR-95, PAR-100, PAR-101, `BD:241`, `BD:246`): a mesma leitura e as mesmas recusas do
   * ranking (mês inválido, fora do histórico, slug indisponível; o 429 é do `protegerRotasPublicas`, antes de tudo), e
   * `calcularPdf` no `pdfPublico`: até 12 colunas, linhas sem id. `urlPublica` = `<URL_PUBLICA>/g/<slug>`, a única
   * origem de endereço absoluto.
   */
  rotas.get('/publico/:slug/pdf', async (c) => {
    const consulta = consultaMesPublico.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupo = await grupoDoSlug(c);
    if (grupo instanceof Response) return grupo;

    const hoje = c.var.relogio.hoje();
    const mes = consulta.data.mes ?? mesDe(hoje);
    const h = await historico.carregar(c.var.db, grupo.id, hoje);
    if (!mesNoHistorico(limitesDeMes(h.partidas, hoje), mes)) return respostaDeCampo(c, 'mes', MENSAGEM_MES_FORA_DO_HISTORICO);
    const p = calcularPdf({ ...h, hoje, mes });

    const resposta: PdfPublico = {
      grupo: { nome: grupo.nome, slug: grupo.slug },
      mes,
      geradoEm: c.var.relogio.agoraIso(),
      urlPublica: linkPublico(c.env.URL_PUBLICA, grupo.slug),
      semPartidasNoMes: p.semPartidasNoMes,
      colunas: p.colunas.map((col) => ({ data: col.data, choveu: col.choveu, doMesExibido: col.doMesExibido })),
      linhas: p.linhas.map(linhaPublicaDe),
    };
    return c.json(resposta, 200);
  });

  /**
   * `POST …/eventos` (T47; PAR-127 a PAR-129, `BD:242`, `BD:247`):
   * - corpo acima de 1 KB: 413 "O corpo da requisição é grande demais.", antes de ler o JSON (PAR-128);
   * - corpo fora do `eventoPublicoCorpo` (tipo desconhecido, campo a mais, aparelho que não é UUID v4): 422;
   * - `evento_publico_registrar` com o slug do contexto e o instante do relógio; `false` (grupo inexistente ou
   *   arquivado): 404 com o corpo do PAR-90; gravado: 204;
   * - a linha só tem grupo, tipo, momento e o aparelho ou o mês: nem IP, nem user-agent, nem conta (PAR-129; a conta da
   *   sessão já foi apagada pelo `contextoPublico`).
   */
  rotas.post(
    '/publico/:slug/eventos',
    bodyLimit({
      maxSize: LIMITE_CORPO_EVENTO_BYTES,
      onError: (c) => c.json({ erro: MENSAGEM_CORPO_GRANDE }, 413),
    }),
    async (c) => {
      const corpo = await lerCorpoDoGrupo(c, eventoPublicoCorpo);
      if (!corpo.ok) return corpo.resposta;
      const gravou = await eventos.registrarPublico(c.var.db, c.var.slugPublico ?? '', corpo.dados, c.var.relogio.agoraIso());
      if (!gravou) return c.json(corpoDoErro('nao_encontrado'), 404);
      return c.body(null, 204);
    },
  );

  return rotas;
}
