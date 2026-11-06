import type { PlanoResposta } from '@pelada/contrato/plano';
import { mostraFaturaEmAberto } from '@pelada/dominio';
import { useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { erroDePlano, useCancelar } from '../../dados/plano.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { dataBr } from './datas.ts';

/**
 * A assinatura atual em Meu plano (planos-e-cobranca T46; PLA-54, PLA-55; AD-096, AD-115). Só para a criadora com
 * assinatura pendente ou ativa (Meu plano decide quando mostrar):
 * - pendente, ou grupo `inadimplente` com a fatura em aberto (AD-096): "Aguardando a confirmação do pagamento" e o link
 *   da fatura; reabrir a tela relê o plano (PLA-54, `usePlano` sem cache velho);
 * - "Cancelar assinatura" na ativa e na pendente (AD-115), com o `Dialogo` de confirmação: na ativa, "O grupo continua
 *   Pro até dd/mm/aaaa" (`pagoAte`); na pendente, a fatura deixa de valer. Confirmado, `DELETE …/assinatura`;
 * - 502: a mensagem da API na faixa de erro, e o plano não muda (PLA-56); o `useCancelar` relê o plano de todo jeito.
 */

export const TEXTO_AGUARDANDO = 'Aguardando a confirmação do pagamento';
export const TEXTO_FATURA_PENDENTE_CANCELADA = 'A fatura em aberto deixa de valer.';

export function textoContinuaPro(pagoAte: string): string {
  return `O grupo continua Pro até ${dataBr(pagoAte)}`;
}

export function AssinaturaAtual({ plano, grupoId }: { plano: PlanoResposta; grupoId: string }) {
  const cancelar = useCancelar(grupoId);
  const [confirmando, setConfirmando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const assinatura = plano.assinatura;
  if (assinatura === null || assinatura.situacao === 'cancelada') return null;

  const aguardando =
    assinatura.situacao === 'aguardando_pagamento' ||
    (mostraFaturaEmAberto(plano.situacao, assinatura.situacao) && assinatura.faturaUrl !== null);
  const descricao =
    assinatura.situacao === 'ativa' && plano.pagoAte
      ? textoContinuaPro(plano.pagoAte)
      : TEXTO_FATURA_PENDENTE_CANCELADA;

  function confirmar() {
    setFalha(null);
    cancelar.mutate(undefined, {
      onSuccess: () => setConfirmando(false),
      onError: (erro) => {
        setConfirmando(false);
        const dePlano = erroDePlano(erro);
        if (dePlano?.tipo === 'pagamento_indisponivel') setFalha(dePlano.mensagem);
        else setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      },
    });
  }

  return (
    <section className={modulo.cartao} aria-labelledby="t-assinatura">
      <h2 id="t-assinatura" className={estilos.subtitulo}>
        Assinatura
      </h2>
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      {aguardando ? (
        <p>
          {TEXTO_AGUARDANDO}
          {assinatura.faturaUrl ? (
            <>
              {' '}
              <a href={assinatura.faturaUrl} target="_blank" rel="noopener noreferrer">
                Abrir a fatura
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <Botao variante="texto-destrutivo" onClick={() => setConfirmando(true)}>
        Cancelar assinatura
      </Botao>
      {confirmando ? (
        <Dialogo
          titulo="Cancelar a assinatura?"
          descricao={descricao}
          alerta
          aoFechar={() => setConfirmando(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setConfirmando(false)}>
                Voltar
              </Botao>
              <Botao variante="destrutivo" carregando={cancelar.isPending} onClick={confirmar}>
                {cancelar.isPending ? 'Cancelando…' : 'Cancelar assinatura'}
              </Botao>
            </>
          }
        />
      ) : null}
    </section>
  );
}
