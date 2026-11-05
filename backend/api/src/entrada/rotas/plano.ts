import { Hono } from 'hono';
import { corpoDoErro, type PlanoResposta } from '@pelada/contrato';
import { mostraFaturaEmAberto, ultimoDiaDoTrial } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { estadoDoPlano } from '../../aplicacao/plano/recurso-liberado.ts';
import { motivoSomenteLeitura } from '../../aplicacao/plano/somente-leitura.ts';
import { plano as repositorioPlano } from '../../infraestrutura/db/repositorios/plano.ts';

/**
 * `GET /api/grupos/:grupoId/plano` (planos-e-cobranca T24; PLA-08, PLA-09, PLA-71; AD-096). A cadeia das rotas de grupo
 * vem antes (sessão 401, transação com a conta, vínculo 404 igual ao de grupo inexistente, PLA-09); GET não passa pelas
 * travas de escrita. O plano é decidido pelo `estadoDoPlano` (T21) com o "hoje" do Relógio da requisição (data de São
 * Paulo, PLA-71); nada aqui decide plano.
 *
 * - `trialFimEm`: só com o plano em `trial`. [LACUNA] A spec (PLA-08) não diz se é o último dia Pro ou o primeiro dia
 *   Free; a tela mostra "Trial Pro até dd/mm/aaaa" (PLA-52), então vai o último dia Pro (`ultimoDiaDoTrial`, o 14º dia
 *   contando o da criação). O /executar confirma com o usuário.
 * - `pagoAte`: o da assinatura (T12), quando houver;
 * - `somenteLeitura`: o motivo de uma escrita comum (`escrita`), o mesmo que o `exigirPlanoEditavel` usaria;
 * - `recursos`: os que o plano libera (tabela do domínio); `limiteJogadores`: 20 no Free, `null` nos outros;
 * - `podeAssinar`: verdadeiro só para a criadora (PLA-08, PLA-32);
 * - `assinatura`: a vigente, com `faturaUrl` só quando há fatura em aberto (pendente, ou o grupo `inadimplente` com a
 *   assinatura ativa, AD-096; `mostraFaturaEmAberto` do domínio).
 */
export function rotasPlano(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/plano', async (c) => {
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();
    const estado = await estadoDoPlano(c.var.db, grupoId, hoje);
    if (estado === null) return c.json(corpoDoErro('nao_encontrado'), 404);

    const motivo = await motivoSomenteLeitura(c.var.db, grupoId, hoje, estado, 'escrita');
    const assinatura = await repositorioPlano.assinaturaVigente(c.var.db, grupoId);
    const limite = estado.recursosDoPlano.limiteJogadores;

    const resposta: PlanoResposta = {
      plano: estado.plano,
      situacao: estado.situacaoComercial,
      trialFimEm:
        estado.plano === 'trial' && estado.trialInicio !== null
          ? ultimoDiaDoTrial(estado.trialInicio)
          : null,
      pagoAte: estado.pagoAte,
      jogadoresAtivos: estado.jogadoresAtivos,
      limiteJogadores: limite === 20 ? 20 : null,
      somenteLeitura: motivo === null ? null : { motivo },
      recursos: [...estado.recursosDoPlano.recursos],
      podeAssinar: c.var.contaId !== undefined && c.var.contaId === estado.criadoPor,
      assinatura:
        assinatura === null
          ? null
          : {
              situacao: assinatura.situacao,
              faturaUrl: mostraFaturaEmAberto(estado.situacaoComercial, assinatura.situacao)
                ? assinatura.faturaUrl
                : null,
            },
    };
    return c.json(resposta, 200);
  });

  return rotas;
}
