import { diaDaSemana, mesDe } from '@pelada/dominio';
import { INICIO_DO_GRUPO } from '@pelada/contrato/pesos';
import { Link, useLocation, useParams } from 'react-router';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import estilosCasca from '../../componentes/Casca.module.css';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { formatarReais } from '../../dados/dinheiro.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { textoRecorrencia } from '../grupos/recorrencia.ts';
import { nomeCurtoDoMes } from '../ranking/PaginaRanking.tsx';

/** `/g/<slug>`: o ranking público do grupo (PAR-83). */
export function caminhoDoRanking(slug: string): string {
  return `/g/${encodeURIComponent(slug)}`;
}

/**
 * Início do grupo (`/app/grupos/:grupoId`, t09; GEL-20, GEL-114; partidas-e-ranking T64: PAR-133 a PAR-136, PAR-160),
 * de `t09-inicio--sucesso.html` e `t09-inicio--sem-jogadores.html` do mockup do módulo da partidas-e-ranking (R-02,
 * R-03):
 * - barra com o nome do grupo, "Trocar grupo" (`/app`) e "Ver ranking" (`/g/:slug`, T58); título só para o leitor de
 *   tela; o aviso da navegação ("Partida de dd/mm salva.", T60);
 * - "Dia de jogo": com jogador ativo, "Lançar partida de qui, 22/10" (abre o lançamento na data sugerida) ou "Editar
 *   partida de qui, 15/10" quando a partida da data sugerida já existe (PAR-133); sem jogador ativo, o cadastro;
 * - "Gerenciar", na ordem do mockup: Partidas ("N em <mês>"/"Nenhuma em <mês>", PAR-134), Jogadores, Habilidades,
 *   Pontuação ("Pesos padrão"/"Vigente desde dd/mm/aaaa", PAR-135), Admins, Dados do grupo e Uso do app ("Esta semana:
 *   N aparelhos", singular para 1, ou "Sem uso registrado", PAR-136);
 * - Simulador (simulador T51; SIM-08, SIM-84; substitui a omissão da PAR-160): no "Dia de jogo", com jogador ativo,
 *   o botão "Simulador: qui, 22/10" (próximo dia de jogo, abre `/simulador`) e, abaixo dele, "Escalação de 22/10
 *   confirmada" ou "Nenhuma escalação confirmada para 22/10". O mockup põe o item no bloco "Dia de jogo"
 *   (`t09-inicio--sucesso.html:19-20`), não na lista "Gerenciar";
 * - Financeiro (financeiro T43; FIN-34, AD-079), de `.specs/mockup/telas/t09-inicio--sucesso.html:21`: o item
 *   "Financeiro" com "Saldo R$ …" (ou "Caixa não configurado" com o saldo nulo), link para o t22, só quando a resposta
 *   traz a chave `saldoFinanceiroCentavos`; sem a chave (quem não acessa o financeiro), nenhum item (o PAR-160 vale aí,
 *   autorização de 2026-11-04 da `financeiro` no `STATE.md`). Fica por último, depois de "Uso do app";
 * - Meu plano (planos-e-cobranca T47; PLA-59): o item "Meu plano" para todo admin, numa lista "Plano" própria depois
 *   de "Gerenciar". [LACUNA] sem mockup do item; fica fora de "Gerenciar" porque os testes da GEL-114 e da FIN-34
 *   fixam aquela lista (7 itens, Financeiro por último) e mudá-los pede aprovação.
 *
 * O mês do item Partidas é o de hoje em São Paulo (`partidasNoMes` conta o mês de hoje, PAR-132).
 */

export const TEXTO_SEM_JOGADORES = 'Cadastre os jogadores para lançar partidas.';

export function textoJogadores(n: number): string {
  // [LACUNA] o mockup só mostra "Nenhum cadastrado" (grupo novo); com só inativos, o texto segue o mesmo.
  if (n === 0) return 'Nenhum cadastrado';
  return n === 1 ? '1 ativo' : `${n} ativos`;
}

export function textoHabilidades(n: number): string {
  if (n === 0) return 'Nenhuma habilidade';
  return n === 1 ? '1 habilidade' : `${n} habilidades`;
}

export function textoAdmins(n: number): string {
  return n === 1 ? '1 admin' : `${n} admins`;
}

export const TEXTO_CAIXA_NAO_CONFIGURADO = 'Caixa não configurado';

/**
 * Meta do item "Meu plano" (planos-e-cobranca T47; PLA-59). [LACUNA] a spec não define a meta do item; fica um texto
 * fixo, sem ler o plano no início do grupo (evita uma consulta a mais na tela mais aberta).
 */
export const TEXTO_META_MEU_PLANO = 'Plano, assinatura e recursos';

const DIAS_ABREVIADOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "2026-10-22" → "qui, 22/10". */
export function diaAbreviado(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${DIAS_ABREVIADOS[diaDaSemana(data)] ?? ''}, ${dia}/${mes}`;
}

/** "Simulador: qui, 22/10" (SIM-08), do próximo dia de jogo. */
export function textoItemSimulador(proximoDiaDeJogo: string): string {
  return `Simulador: ${diaAbreviado(proximoDiaDeJogo)}`;
}

/** "Escalação de 22/10 confirmada" ou "Nenhuma escalação confirmada para 22/10" (SIM-08). */
export function textoStatusEscalacao(proximoDiaDeJogo: string, confirmada: boolean): string {
  const [, mes, dia] = proximoDiaDeJogo.split('-');
  const ddmm = `${dia}/${mes}`;
  return confirmada
    ? `Escalação de ${ddmm} confirmada`
    : `Nenhuma escalação confirmada para ${ddmm}`;
}

/** "3 em outubro", "Nenhuma em outubro" (PAR-134). */
export function textoPartidasDoMes(n: number, mes: string): string {
  const nome = nomeCurtoDoMes(mes);
  return n === 0 ? `Nenhuma em ${nome}` : `${n} em ${nome}`;
}

/** "Pesos padrão" ou "Vigente desde 01/09/2026" (PAR-135). */
export function textoPontuacao(g: { pesosPadrao: boolean; pesosVigentesDesde: string }): string {
  if (g.pesosPadrao) return 'Pesos padrão';
  if (g.pesosVigentesDesde === INICIO_DO_GRUPO) return 'Desde o início do grupo';
  const [ano, mes, dia] = g.pesosVigentesDesde.split('-');
  return `Vigente desde ${dia}/${mes}/${ano}`;
}

/** "Esta semana: 12 aparelhos", "Esta semana: 1 aparelho", "Sem uso registrado" (PAR-136). */
export function textoUso(n: number): string {
  if (n === 0) return 'Sem uso registrado';
  return `Esta semana: ${n} ${n === 1 ? 'aparelho' : 'aparelhos'}`;
}

/** "Saldo R$ 1.245,50"; nulo (caixa sem configuração) → "Caixa não configurado". */
export function textoSaldo(centavos: number | null): string {
  return centavos === null ? TEXTO_CAIXA_NAO_CONFIGURADO : `Saldo ${formatarReais(centavos)}`;
}

export function InicioGrupo() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const local = useLocation();
  const base = rotaDoGrupo(grupoId);
  const nome = grupo.data?.nome ?? NOME_DO_APP;

  function conteudo() {
    if (grupo.isPending) return <EsqueletoLista linhas={4} />;
    if (grupo.isError) {
      if (grupo.error instanceof ErroApi && grupo.error.status === 404) {
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void grupo.refetch()} />;
    }
    const g = grupo.data;
    const temAtivos = g.jogadoresAtivos > 0;
    return (
      <>
        <section className={modulo['dia-de-jogo']} aria-labelledby="t-dia">
          <h2 id="t-dia" className={modulo['dia-de-jogo__titulo']}>
            Dia de jogo
          </h2>
          {temAtivos ? (
            <>
              {g.partidaNaDataSugerida ? (
                <LinkBotao
                  para={`${base}/partidas/${encodeURIComponent(g.dataSugeridaPartida)}`}
                  variante="principal"
                  bloco
                >
                  {`Editar partida de ${diaAbreviado(g.dataSugeridaPartida)}`}
                </LinkBotao>
              ) : (
                <LinkBotao para={`${base}/partidas/nova`} variante="principal" bloco>
                  {`Lançar partida de ${diaAbreviado(g.dataSugeridaPartida)}`}
                </LinkBotao>
              )}
              {/* Simulador (simulador T51; SIM-08, SIM-84), de `t09-inicio--sucesso.html:19-20`. */}
              <LinkBotao para={`${base}/simulador`} variante="secundario" bloco>
                {textoItemSimulador(g.proximoDiaDeJogo)}
              </LinkBotao>
              <p className={modulo['dia-de-jogo__status']}>
                {g.escalacaoNoProximoDia ? (
                  <svg
                    className={modulo['dia-de-jogo__icone']}
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
                {textoStatusEscalacao(g.proximoDiaDeJogo, g.escalacaoNoProximoDia)}
              </p>
            </>
          ) : (
            <>
              <p>{TEXTO_SEM_JOGADORES}</p>
              <LinkBotao para={`${base}/jogadores/novo`} variante="principal" bloco>
                Cadastrar jogadores
              </LinkBotao>
            </>
          )}
        </section>
        <h2 className={estilos.subtitulo}>Gerenciar</h2>
        <Lista rotulo="Gerenciar">
          <ItemLista
            titulo="Partidas"
            meta={textoPartidasDoMes(g.partidasNoMes, mesDe(hojeEmSaoPaulo()))}
            para={`${base}/partidas`}
          />
          <ItemLista
            titulo="Jogadores"
            meta={textoJogadores(g.jogadoresAtivos)}
            para={`${base}/jogadores`}
          />
          <ItemLista
            titulo="Habilidades"
            meta={textoHabilidades(g.habilidades)}
            para={`${base}/habilidades`}
          />
          <ItemLista titulo="Pontuação" meta={textoPontuacao(g)} para={`${base}/pontuacao`} />
          <ItemLista titulo="Admins" meta={textoAdmins(g.admins)} para={`${base}/admins`} />
          <ItemLista
            titulo="Dados do grupo"
            meta={`${textoRecorrencia(g)} · link do ranking`}
            para={`${base}/dados`}
          />
          <ItemLista
            titulo="Uso do app"
            meta={textoUso(g.aparelhosNaSemana)}
            para={`${base}/uso`}
          />
          {g.saldoFinanceiroCentavos !== undefined ? (
            <ItemLista
              titulo="Financeiro"
              meta={textoSaldo(g.saldoFinanceiroCentavos)}
              para={`${base}/financeiro`}
            />
          ) : null}
        </Lista>
        {/* Meu plano (planos-e-cobranca T47; PLA-59): para todo admin, criadora ou convidada. */}
        <h2 className={estilos.subtitulo}>Plano</h2>
        <Lista rotulo="Plano">
          <ItemLista titulo="Meu plano" meta={TEXTO_META_MEU_PLANO} para={`${base}/plano`} />
        </Lista>
      </>
    );
  }

  // "Partida de dd/mm salva." (partidas-e-ranking T60; PAR-36): o aviso que a tela de lançar manda na navegação.
  const estado = local.state as { aviso?: unknown } | null;
  const avisoDaNavegacao = typeof estado?.aviso === 'string' ? estado.aviso : null;

  // "Ver ranking" (partidas-e-ranking T58; PAR-83): abre o ranking público `/g/:slug`, de `t09-inicio--sucesso.html:13`.
  const verRanking = grupo.data ? (
    <Link
      className={`${estilosCasca['botao-icone']} ${estilosCasca['botao-icone--sem-borda']}`}
      to={caminhoDoRanking(grupo.data.slug)}
      aria-label="Ver ranking"
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    </Link>
  ) : undefined;

  return (
    <Casca grupo={{ nome, trocarHref: '/app' }} ocupada={grupo.isPending} acoes={verRanking}>
      <h1 className="sr">{`Início do admin: ${nome}`}</h1>
      {avisoDaNavegacao ? <Faixa tipo="sucesso">{avisoDaNavegacao}</Faixa> : null}
      {conteudo()}
    </Casca>
  );
}
