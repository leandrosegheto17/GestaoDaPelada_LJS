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
