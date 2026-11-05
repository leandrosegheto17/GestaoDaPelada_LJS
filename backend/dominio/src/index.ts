export const PACOTE = '@pelada/dominio';

// grupos-e-elenco (GEL-70, GEL-104): regras puras, sem relógio nem I/O.
export { slugBase, SLUGS_RESERVADOS } from './grupos/slug.ts';
export { chaveBusca, compararApelido, formatarData } from './elenco/apelido.ts';
export {
  ANO_NASCIMENTO_MINIMO,
  anoNascimentoMaximo,
  calcularNivel,
  HABILIDADES_INICIAIS,
  NIVEL_SEM_NOTA,
  type Nivel,
} from './elenco/nivel.ts';
export {
  ativoEm,
  contem,
  ehDataValida,
  ehFutura,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_FUTURO,
  somarDias,
  sobrepoem,
  validarData,
  type CampoPeriodo,
  type Data,
  type FalhaPeriodo,
  type Periodo,
  type RegraPeriodo,
} from './atividade/datas.ts';
export { MENSAGEM_SOBREPOSICAO, verificarOrdem, verificarSobreposicao } from './atividade/ordem.ts';
export {
  coberturaRetirada,
  falhaPresenca,
  type PresencaJogador,
  type Retirada,
  type SituacaoPresenca,
} from './atividade/cobertura.ts';
export {
  avaliarPeriodos,
  EstadoDePeriodoInvalido,
  MENSAGEM_INICIO_DO_PRIMEIRO,
  MENSAGEM_SEM_SAIDA,
  type EntradaAvaliacao,
  type OperacaoPeriodo,
  type ResultadoAvaliacao,
} from './atividade/avaliar-periodos.ts';
export {
  avaliarInicio,
  MENSAGEM_ANTES_DO_PISO,
  PISO_INICIO,
  type EntradaInicio,
  type FalhaInicio,
  type RegraInicio,
  type ResultadoInicio,
} from './atividade/avaliar-inicio.ts';

// partidas-e-ranking (PAR-61, PAR-62): pontos, ranking, PDF e prévias, sem relógio nem I/O.
export {
  compararDatas,
  compararMeses,
  diaDaSemana,
  ehDataReal,
  ehMes,
  mesAnterior,
  mesDe,
  mesSeguinte,
  NUMERO_DO_DIA,
  primeiroDia,
  ultimoDia,
  vespera,
  type DiaDaSemana,
  type Mes,
  type NomeDiaDaSemana,
} from './datas.ts';
export {
  CAMPOS_DE_PESO,
  ehPesosPadrao,
  PESOS_PADRAO,
  pontosDaPresenca,
  type ConfigPesos,
  type Pesos,
  type PresencaDoJogador,
  type SituacaoGravada,
} from './pontuacao/pesos.ts';
export { criarResolvedorDePesos, MENSAGEM_SEM_PESOS, type ResolvedorDePesos } from './pontuacao/resolvedor.ts';
export { inicioDaContagem } from './pontuacao/inicio.ts';

// planos-e-cobranca (PLA-01 a PLA-06): plano efetivo, recursos e preço, sem relógio nem I/O.
export {
  DIAS_DE_TRIAL,
  fimDoTrial,
  planoEfetivo,
  PLANOS,
  SITUACOES_COMERCIAIS,
  ultimoDiaDoTrial,
  type Plano,
  type SituacaoComercial,
} from './plano/plano-efetivo.ts';
export { acumuladoPorInicio, type EntradaAcumulado } from './pontuacao/acumulado.ts';
export {
  centavosParaReais,
  formatarPreco,
  LIMITE_GRUPOS_FREE,
  LIMITE_JOGADORES_FREE,
  planoLibera,
  PRECO_PRO_CENTAVOS,
  reaisParaCentavos,
  RECURSOS,
  RECURSOS_POR_PLANO,
  RECURSOS_PRO,
  type Recurso,
  type RecursoPro,
  type RecursosDoPlano,
} from './plano/recursos.ts';
export { pagoAteDe } from './plano/pago-ate.ts';
export { mostraFaturaEmAberto } from './plano/fatura.ts';
export { dataSugeridaPartida } from './partidas/data-sugerida.ts';
export {
  ativosNaData,
  contagemDaPartida,
  MENSAGEM_JOGADOR_INATIVO,
  MENSAGEM_JOGADOR_REPETIDO,
  MENSAGEM_SITUACAO,
  SITUACOES_MARCACAO,
  validarMarcacoes,
  type ContagemDaPartida,
  type Marcacao,
  type PresencaMarcada,
  type ResultadoMarcacoes,
  type SituacaoMarcacao,
} from './partidas/marcacoes.ts';
export { ANO_SEM_INFORMACAO, ordenarPorRanking, type Colocado, type Rankeavel } from './ranking/ordenar.ts';
export {
  efeitoDoEvento,
  EVENTOS_TRATADOS,
  SITUACOES_ASSINATURA,
  type AssinaturaGravada,
  type CobrancaDoEvento,
  type EfeitoDoEvento,
  type EventoAsaas,
  type MotivoSemEfeito,
  type SituacaoAssinatura,
} from './plano/eventos-asaas.ts';
export {
  rodadasDoJogador,
  type JogadorDaRodada,
  type PartidaDaRodada,
  type Rodada,
  type SituacaoRodada,
} from './ranking/rodadas.ts';
export {
  grupoFreeEditavel,
  somenteLeitura,
  type EntradaExcedente,
  type GrupoDaCriadora,
  type MotivoSomenteLeitura,
  type OperacaoDeEscrita,
} from './plano/excedente.ts';
export {
  calcularRanking,
  type EntradaRanking,
  type JogadorDoRanking,
  type LinhaRanking,
  type PartidaDoMes,
  type PartidaDoRanking,
  type PresencaDoRanking,
  type ResultadoRanking,
} from './ranking/calcular.ts';
export { limitesDeMes, mesNoHistorico, navegacaoDeMes, type LimitesDeMes, type Navegacao } from './ranking/navegacao.ts';
export {
  calcularPdf,
  escolherColunasPdf,
  MAX_COLUNAS_PDF,
  type ColunaPdf,
  type ColunasPdf,
  type LinhaPdf,
  type ProjecaoPdf,
} from './pdf/calcular.ts';
export {
  compararCenarios,
  MENSAGEM_JOGADOR_FORA_DO_HISTORICO,
  type CenariosComparados,
  type HistoricoDoGrupo,
} from './previas/comparar.ts';
export {
  AVISO_UMA_FALTA,
  AVISO_VARIAS_FALTAS,
  avisoDasRodadas,
  previaDoInicio,
  previaDosPeriodos,
  type PreviaDoInicio,
  type PreviaDosPeriodos,
  type RodadaQueDeixaDeConstar,
  type RodadaQuePassaAConstar,
} from './previas/rodadas.ts';

// financeiro (FIN-09, FIN-18, FIN-49): meses do caixa usados pelas rotas (T26, T27). `mesNoHistorico` já é o do
// ranking: o do caixa sai com outro nome. Os repositórios do financeiro (mes.ts, pagamentos.ts) usam o resto.
export {
  limitesDoCaixa,
  MENSAGEM_MES_FORA_DO_HISTORICO,
  MENSAGEM_MES_FUTURO,
  mesesDoCaixa,
  mesFuturo,
  mesNoHistorico as mesNoHistoricoDoCaixa,
  navegacao,
  type LimitesDoCaixa,
  type NavegacaoDoCaixa,
} from './caixa/mes.ts';
export { ativoNoMes, ativosNoMes, type JogadorComPeriodos } from './caixa/atividade-mes.ts';
export { entradaDaMensalidade, type EntradaDaMensalidade } from './caixa/mensalidade.ts';
export {
  resumoDoMes,
  type AtivoNoMes,
  type MesCaixa,
  type PagamentoDoMes,
  type ResumoDoMes,
} from './caixa/resumo.ts';
export {
  saldoAtual,
  totais,
  type ConfigCaixa,
  type DataCaixa,
  type MovimentoCaixa,
  type Totais,
} from './caixa/saldos.ts';
export {
  ErroCentavosNaoInteiro,
  ErroEstouroCentavos,
  somarCentavos,
  subtrairCentavos,
} from './caixa/centavos.ts';

// notificacoes (NOT-25, NOT-43): payloads do push, sem relógio nem I/O.
export {
  diaEMes,
  NOME_DO_TIPO,
  payloadCobranca,
  payloadRanking,
  serializarPayload,
  TITULO_RANKING,
  type EntradaCobranca,
  type EntradaRanking as EntradaPayloadRanking,
  type PayloadPush,
  type TipoAvisoCobranca,
} from './notificacoes/payload.ts';

// simulador (SIM-47, SIM-50): prévia, sugestão e próximo dia de jogo, sem relógio, sorteio nem I/O.
export {
  idadeNaData,
  proximoDiaDeJogo,
  type Apto,
  type Formato,
  type Limite,
} from './simulador/base.ts';
export { calcularPrevia, type Previa } from './simulador/previa.ts';
export { descreverPrevia } from './simulador/descricao.ts';
export type { ComposicaoDois, TimeDois } from './simulador/chave-dois.ts';
export type { Aviso, TipoAviso } from './simulador/avisos.ts';
export type { IndicadoresTimeDois } from './simulador/indicadores-dois.ts';
export type { IndicadoresTimeVarios } from './simulador/indicadores-varios.ts';
export type { HistoricoSim } from './simulador/prioridade.ts';
export {
  sugerir,
  type EntradaSimulador,
  type Sugestao,
  type SugestaoDois,
  type SugestaoInvalida,
  type SugestaoVarios,
} from './simulador/sugerir.ts';
export {
  avaliar,
  idsDaComposicaoEntrada,
  MENSAGEM_FORA_DOS_APTOS,
  MENSAGEM_REPETIDO_NA_COMPOSICAO,
  problemaNaComposicao,
  type Avaliacao,
  type AvaliacaoDois,
  type AvaliacaoVarios,
  type ComposicaoEntrada,
  type FalhaAvaliacao,
  type JogadorNaComposicao,
} from './simulador/avaliar.ts';
