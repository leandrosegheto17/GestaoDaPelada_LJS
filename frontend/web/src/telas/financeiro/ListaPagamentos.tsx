import type { LancamentoDoMes, MesFinanceiroResposta } from '@pelada/contrato/financeiro';
import { useEffect, useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { formatarReais } from '../../dados/dinheiro.ts';
import {
  erroDoFinanceiro,
  useDesmarcarPagamento,
  useMarcarPagamento,
} from '../../dados/financeiro.ts';
import fin from './financeiro.module.css';

/**
 * Pagamentos do mês com o interruptor "Pagou" (financeiro T39; FIN-24), de
 * `t22-financeiro--{sucesso,desmarcar,erro-pagamento}.html`:
 * - cada ativo do mês com um interruptor (`role="switch"`, "Pagou: <apelido>") e o estado "Pagou" ou "Não pagou";
 * - marcar: o interruptor muda na hora (atualização otimista) e chama o `POST`; na falha volta para "Não pagou" e a faixa
 *   diz "Não foi possível marcar o pagamento de <apelido>. Tente de novo.";
 * - desmarcar: abre o diálogo "Desmarcar o pagamento de <apelido>?" com "A entrada “<descrição>” (R$ <valor>) será
 *   removida do caixa."; "Cancelar" fecha sem chamar a API; "Desmarcar" chama o `DELETE`.
 *
 * A entrada do diálogo é a mensalidade do jogador naquele mês: o lançamento do mês com `mensalidade` e a descrição
 * "Mensalidade <apelido> MM/AAAA" (a que a API cria, FIN-16); se ele não estiver na lista (foi marcado noutro mês, ou a
 * descrição foi editada), a descrição padrão com o valor da mensalidade configurada.
 * [LACUNA] A resposta do mês não liga o pagamento ao lançamento; a spec não define o texto do diálogo quando o
 * pagamento não tem entrada (marcado sem mensalidade, FIN-17): sai só o título, sem o texto da entrada.
 * [LACUNA] A spec só define a mensagem da falha ao marcar; a falha ao desmarcar mostra a mensagem da API na mesma faixa.
 */

export function textoFalhaMarcar(apelido: string): string {
  return `Não foi possível marcar o pagamento de ${apelido}. Tente de novo.`;
}

export function tituloDesmarcar(apelido: string): string {
  return `Desmarcar o pagamento de ${apelido}?`;
}

export function textoDesmarcar(descricao: string, valorCentavos: number): string {
  return `A entrada “${descricao}” (${formatarReais(valorCentavos)}) será removida do caixa.`;
}

/** A entrada da mensalidade do jogador no mês, ou nula quando não há como saber o valor. */
export function entradaDoPagamento(
  apelido: string,
  mes: string,
  lancamentos: readonly LancamentoDoMes[],
  mensalidadeCentavos: number | null,
): { descricao: string; valorCentavos: number } | null {
  const [ano, numero] = mes.split('-');
  const descricao = `Mensalidade ${apelido} ${numero}/${ano}`;
  const achado = lancamentos.find((l) => l.mensalidade && l.descricao === descricao);
  if (achado) return { descricao, valorCentavos: achado.valorCentavos };
  return mensalidadeCentavos === null ? null : { descricao, valorCentavos: mensalidadeCentavos };
}

export interface PropsListaPagamentos {
  grupoId: string;
  dados: MesFinanceiroResposta;
  /**
   * Quem recebe a falha (texto, ou `null` para limpar). Sem ele, a faixa de erro aparece acima da lista; a tela do mês o
   * passa para mostrá-la na largura toda, acima das duas colunas, como no mockup (t22 `erro-pagamento`, FIN-47).
   */
  aoFalhar?: ((texto: string | null) => void) | undefined;
}

export function ListaPagamentos({ grupoId, dados, aoFalhar }: PropsListaPagamentos) {
  const marcar = useMarcarPagamento(grupoId);
  const desmarcar = useDesmarcarPagamento(grupoId);
  const [otimista, setOtimista] = useState<Record<string, boolean>>({});
  const [falhaLocal, setFalhaLocal] = useState<string | null>(null);
  const falha = aoFalhar ? null : falhaLocal;
  const setFalha = aoFalhar ?? setFalhaLocal;
  const [confirmar, setConfirmar] = useState<{ jogadorId: string; apelido: string } | null>(null);

  // A lista nova da API (depois de invalidar) substitui o estado otimista.
  useEffect(() => {
    setOtimista({});
  }, [dados.pagamentos]);

  function aoMarcar(jogadorId: string, apelido: string) {
    setFalha(null);
    setOtimista((o) => ({ ...o, [jogadorId]: true }));
    marcar.mutate(
      { jogadorId, mes: dados.mes },
      {
        onError: () => {
          setOtimista((o) => ({ ...o, [jogadorId]: false }));
          setFalha(textoFalhaMarcar(apelido));
        },
      },
    );
  }

  function aoDesmarcar() {
    if (!confirmar) return;
    const { jogadorId } = confirmar;
    setConfirmar(null);
    setFalha(null);
    desmarcar.mutate(
      { jogadorId, mes: dados.mes },
      { onError: (erro) => setFalha(erroDoFinanceiro(erro).mensagem) },
    );
  }

  const entrada = confirmar
    ? entradaDoPagamento(
        confirmar.apelido,
        dados.mes,
        dados.lancamentos,
        dados.config?.mensalidadeCentavos ?? null,
      )
    : null;

  return (
    <>
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <Lista>
        {dados.pagamentos.map((p) => {
          const pagou = otimista[p.jogadorId] ?? p.pagou;
          return (
            <ItemLista
              key={p.jogadorId}
              titulo={p.apelido}
              lateral={
                <label className={fin.interruptor}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={pagou}
                    aria-label={`Pagou: ${p.apelido}`}
                    onChange={() =>
                      pagou
                        ? setConfirmar({ jogadorId: p.jogadorId, apelido: p.apelido })
                        : aoMarcar(p.jogadorId, p.apelido)
                    }
                  />
                  <span className={fin['interruptor__trilho']} aria-hidden="true" />
                  <span className={fin['interruptor__estado']} aria-hidden="true">
                    {pagou ? 'Pagou' : 'Não pagou'}
                  </span>
                </label>
              }
            />
          );
        })}
      </Lista>
      {confirmar ? (
        <Dialogo
          alerta
          titulo={tituloDesmarcar(confirmar.apelido)}
          descricao={entrada ? textoDesmarcar(entrada.descricao, entrada.valorCentavos) : undefined}
          aoFechar={() => setConfirmar(null)}
          acoes={
            <>
              <Botao
                variante="secundario"
                type="button"
                autoFocus
                onClick={() => setConfirmar(null)}
              >
                Cancelar
              </Botao>
              <Botao variante="destrutivo" type="button" onClick={aoDesmarcar}>
                Desmarcar
              </Botao>
            </>
          }
        />
      ) : null}
    </>
  );
}
