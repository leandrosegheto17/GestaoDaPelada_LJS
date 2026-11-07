import type { LancamentoDoMes, MesFinanceiroResposta } from '@pelada/contrato/financeiro';
import { useParams, useSearchParams } from 'react-router';
import { AvisoRecursoPro } from '../../componentes/AvisoRecursoPro.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { TrechoBloqueado } from '../../componentes/FaixaSomenteLeitura.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { Lista } from '../../componentes/Lista.tsx';
import { TelaMensagem } from '../../componentes/TelaMensagem.tsx';
import { formatarReais } from '../../dados/dinheiro.ts';
import { erroDoFinanceiro, useMesFinanceiro } from '../../dados/financeiro.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { useSemRecurso } from '../../dados/plano.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import fin from './financeiro.module.css';
import { GrupoMensalidades, TEXTO_AJUDA_MENSALIDADES } from './GrupoMensalidades.tsx';
import { ItemLancamento } from './ItemLancamento.tsx';
import { ListaPagamentos } from './ListaPagamentos.tsx';

/**
 * Financeiro do mês (`/app/grupos/:grupoId/financeiro[?mes=AAAA-MM]`, t22; FIN-07, FIN-08, FIN-15, FIN-33, FIN-46), de
 * `.specs/mockup/telas/t22-financeiro--{sucesso,vazio-config,vazio-mes,sem-permissao}.html`:
 * - navegação de mês pelos botões "Mês anterior, <mês>" e "Mês seguinte", que trocam o `?mes=`; o botão sem mês na
 *   navegação da API fica desabilitado (FIN-07);
 * - saldo atual, entradas, saídas, resultado e "Não pagaram N jogadores" (FIN-11, FIN-15), em reais por
 *   `formatarReais` (saída e resultado negativo com "−");
 * - pagamentos do mês com o interruptor de marcar e desmarcar (`ListaPagamentos`, T39) e lançamentos do mês com o
 *   link de edição (`ItemLancamento`), as mensalidades numa linha agrupada (`GrupoMensalidades`, T40); "Nenhum
 *   lançamento neste mês." sem lançamentos;
 * - ações "Configurar caixa" e "Novo lançamento";
 * - sem configuração: "Caixa não configurado" com "Configurar caixa" (FIN-08);
 * - 403 `sem_permissao_financeiro`: "Sem acesso" com "Voltar" para o início do grupo (FIN-33);
 * - sem o recurso `financeiro` no plano (planos-e-cobranca T50; PLA-27): o saldo, o resumo, os pagamentos e os
 *   lançamentos continuam (a leitura não trava, `exigirRecursoNaEscrita`); "Configurar caixa" sai, os interruptores
 *   dos pagamentos ficam desabilitados e o `AvisoRecursoPro` entra no lugar de "Novo lançamento". [LACUNA] a spec não
 *   diz se o link de edição de cada lançamento fica: fica, e a tela de edição recebe o 403 da API ao salvar.
 */

export const TEXTO_SEM_CONFIG = 'Caixa não configurado';
export const TEXTO_SEM_CONFIG_AJUDA = 'Configure o saldo inicial para começar.';
export const TEXTO_SEM_ACESSO = 'Sem acesso';
export const TEXTO_SEM_ACESSO_AJUDA =
  'Você não tem acesso ao financeiro deste grupo. Peça a um admin com acesso.';
export const TEXTO_SEM_LANCAMENTOS = 'Nenhum lançamento neste mês.';

const NOMES_DOS_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** `2026-10` → "outubro de 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, numero] = mes.split('-');
  return `${NOMES_DOS_MESES[Number(numero) - 1] ?? mes} de ${ano}`;
}

/** "1 jogador", "4 jogadores". */
export function jogadores(n: number): string {
  return n === 1 ? '1 jogador' : `${n} jogadores`;
}

/**
 * Os avulsos na ordem da API (do mais recente ao mais antigo) com a linha agrupada das mensalidades (T40) no lugar da
 * mais antiga delas: antes do primeiro avulso de data anterior (`t22-financeiro--sucesso.html:52-54`).
 */
export function ordemDaLista(
  lancamentos: readonly LancamentoDoMes[],
): Array<LancamentoDoMes | 'mensalidades'> {
  const avulsos = lancamentos.filter((l) => !l.mensalidade);
  const mensalidades = lancamentos.filter((l) => l.mensalidade);
  if (mensalidades.length === 0) return avulsos;
  const maisAntiga = mensalidades.map((m) => m.data).sort()[0] ?? '';
  const posicao = avulsos.findIndex((a) => a.data < maisAntiga);
  const resultado: Array<LancamentoDoMes | 'mensalidades'> = [...avulsos];
  resultado.splice(posicao === -1 ? avulsos.length : posicao, 0, 'mensalidades');
  return resultado;
}

function Seta({ direcao }: { direcao: 'anterior' | 'seguinte' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={direcao === 'anterior' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function NavegacaoMes({
  dados,
  aoIr,
}: {
  dados: MesFinanceiroResposta;
  aoIr: (mes: string) => void;
}) {
  const { mesAnterior, mesSeguinte } = dados.navegacao;
  return (
    <nav className={fin.mes} aria-label="Mês exibido">
      <button
        className={fin['mes__botao']}
        type="button"
        aria-label={mesAnterior ? `Mês anterior, ${nomeDoMes(mesAnterior)}` : 'Mês anterior'}
        disabled={mesAnterior === null}
        onClick={() => mesAnterior && aoIr(mesAnterior)}
      >
        <Seta direcao="anterior" />
      </button>
      <h2 className={fin['mes__rotulo']}>{nomeDoMes(dados.mes)}</h2>
      <button
        className={fin['mes__botao']}
        type="button"
        aria-label={mesSeguinte ? `Mês seguinte, ${nomeDoMes(mesSeguinte)}` : 'Mês seguinte'}
        disabled={mesSeguinte === null}
        onClick={() => mesSeguinte && aoIr(mesSeguinte)}
      >
        <Seta direcao="seguinte" />
      </button>
    </nav>
  );
}

function Mes({
  grupoId,
  dados,
  base,
  aoIr,
  semRecurso,
}: {
  grupoId: string;
  dados: MesFinanceiroResposta;
  base: string;
  aoIr: (mes: string) => void;
  /** Free sem o financeiro (planos-e-cobranca T50; PLA-27): os dados ficam, a escrita vira o aviso Pro. */
  semRecurso: boolean;
}) {
  const { config, resumoMes, saldoAtualCentavos } = dados;
  if (config === null || resumoMes === null || saldoAtualCentavos === null) {
    return (
      <div className={estilos.vazio}>
        <h2 className={estilos['vazio__titulo']}>{TEXTO_SEM_CONFIG}</h2>
        {semRecurso ? (
          <AvisoRecursoPro recurso="financeiro" grupoId={grupoId} />
        ) : (
          <>
            <p className={estilos['vazio__texto']}>{TEXTO_SEM_CONFIG_AJUDA}</p>
            <LinkBotao para={`${base}/financeiro/config`} variante="principal">
              Configurar caixa
            </LinkBotao>
          </>
        )}
      </div>
    );
  }
  const titulo =
    config.mensalidadeCentavos === null
      ? 'Pagamentos do mês'
      : `Pagamentos do mês · ${formatarReais(config.mensalidadeCentavos)}`;
  return (
    <>
      <div className={fin.ferramentas}>
        <NavegacaoMes dados={dados} aoIr={aoIr} />
        {semRecurso ? null : (
          <LinkBotao para={`${base}/financeiro/config`} variante="texto">
            Configurar caixa
          </LinkBotao>
        )}
      </div>
      <section className={fin.saldos} aria-labelledby="saldo">
        <p className={fin['saldos__rotulo']} id="saldo">
          Saldo atual
        </p>
        <p className={fin['saldos__valor']}>{formatarReais(saldoAtualCentavos)}</p>
        <dl className={fin['saldos__grade']}>
          <dt>Entradas no mês</dt>
          <dd>{formatarReais(resumoMes.entradasCentavos)}</dd>
          <dt>Saídas no mês</dt>
          <dd>{formatarReais(resumoMes.saidasCentavos)}</dd>
          <dt>Resultado do mês</dt>
          <dd>{formatarReais(resumoMes.resultadoCentavos)}</dd>
          <dt>Não pagaram</dt>
          <dd>{jogadores(resumoMes.naoPagaram)}</dd>
        </dl>
      </section>
      <div className={fin['lado-a-lado']}>
        <section aria-labelledby="pag">
          <h2 id="pag" className={estilos.subtitulo}>
            {titulo}
          </h2>
          <TrechoBloqueado bloqueado={semRecurso}>
            <ListaPagamentos grupoId={grupoId} dados={dados} />
          </TrechoBloqueado>
        </section>
        <section aria-labelledby="lan">
          <h2 id="lan" className={estilos.subtitulo}>
            Lançamentos do mês
          </h2>
          {dados.lancamentos.length === 0 ? (
            <div className={estilos.vazio}>
              <p className={estilos['vazio__texto']}>{TEXTO_SEM_LANCAMENTOS}</p>
            </div>
          ) : (
            <>
              <Lista>
                {ordemDaLista(dados.lancamentos).map((l) =>
                  l === 'mensalidades' ? (
                    <GrupoMensalidades
                      key="mensalidades"
                      mes={dados.mes}
                      mensalidades={dados.lancamentos.filter((m) => m.mensalidade)}
                      base={base}
                    />
                  ) : (
                    <ItemLancamento key={l.id} l={l} base={base} />
                  ),
                )}
              </Lista>
              {dados.lancamentos.some((l) => l.mensalidade) ? (
                <p className={fin.ajuda}>{TEXTO_AJUDA_MENSALIDADES}</p>
              ) : null}
            </>
          )}
        </section>
      </div>
      {semRecurso ? (
        <AvisoRecursoPro recurso="financeiro" grupoId={grupoId} />
      ) : (
        <>
          <div className={modulo['reserva-barra']} aria-hidden="true" />
          <div className={modulo['barra-acao']}>
            <LinkBotao para={`${base}/financeiro/lancamentos/novo`} variante="principal">
              Novo lançamento
            </LinkBotao>
          </div>
        </>
      )}
    </>
  );
}

export function FinanceiroMes() {
  const { grupoId = '' } = useParams();
  const [busca, setBusca] = useSearchParams();
  const mes = busca.get('mes') ?? undefined;
  const grupo = useGrupo(grupoId);
  const consulta = useMesFinanceiro(grupoId, mes);
  const semRecurso = useSemRecurso(grupoId, 'financeiro');
  const base = rotaDoGrupo(grupoId);
  const barra = { nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' };

  if (consulta.isError) {
    const erro = erroDoFinanceiro(consulta.error);
    if (erro.codigo === 'sem_permissao_financeiro') {
      return (
        // O mockup (t22 sem-permissão) tem só o nome do grupo na barra, sem "Trocar grupo", e o cadeado.
        <Casca grupo={{ nome: barra.nome }} centralizada>
          <TelaMensagem
            icone="cadeado"
            titulo={TEXTO_SEM_ACESSO}
            acao={
              <LinkBotao para={base} variante="secundario">
                Voltar
              </LinkBotao>
            }
          >
            {TEXTO_SEM_ACESSO_AJUDA}
          </TelaMensagem>
        </Casca>
      );
    }
  }

  function conteudo() {
    if (consulta.isPending) return <EsqueletoLista />;
    if (consulta.isError) {
      const erro = erroDoFinanceiro(consulta.error);
      if (erro.codigo === 'nao_encontrado')
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      // Mês fora do histórico ou malformado no endereço (FIN-09): a mensagem da API e o caminho de volta ao mês atual.
      if (erro.status === 422) {
        return (
          <Faixa
            tipo="atencao"
            acao={<LinkBotao para={`${base}/financeiro`}>Ir para o mês atual</LinkBotao>}
          >
            {erro.campos['mes'] ?? erro.mensagem}
          </Faixa>
        );
      }
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    return (
      <Mes
        grupoId={grupoId}
        dados={consulta.data}
        base={base}
        aoIr={(m) => setBusca({ mes: m })}
        semRecurso={semRecurso}
      />
    );
  }

  const semConfig = consulta.isSuccess && consulta.data.config === null;
  return (
    <Casca grupo={barra} ocupada={consulta.isPending} estreita={semConfig}>
      <LinkVoltar para={base}>Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Financeiro</h1>
      {conteudo()}
    </Casca>
  );
}
