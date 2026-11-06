import type { DisponibilidadePush } from '@pelada/contrato/push';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { dependenciasPush, type DependenciasPush } from '../../push/assinatura.ts';
import { ControleAvisos, type TextosAvisos } from '../ranking/ControlePush.tsx';
import estilos from '../acesso.module.css';

/**
 * "Receber avisos de cobrança neste aparelho" em Minha conta (`/app/conta`; notificacoes T38; NOT-44, NOT-72; AD-106,
 * AD-072). A assinatura é da conta, não de um grupo: o aviso de cobrança vai só para a criadora (NOT-38).
 *
 * - aparece só com `GET /api/conta/push` dizendo `oferecer: true` (criadora de algum grupo não arquivado, com VAPID) e
 *   com suporte no navegador; admin convidada, conta sem grupo, sem VAPID ou GET que falha: nada;
 * - os estados, o pedido de permissão só no toque e o cancelar são os do controle do ranking (`ControleAvisos`, T37),
 *   com o destino `conta` (`/api/conta/push`);
 * - os componentes e tokens do guia (AD-111); a t32 comparada não muda, porque o runner não simula a rota (AD-072).
 */

export const TITULO_AVISOS_COBRANCA = 'Avisos de cobrança';
export const TEXTO_RECEBER_COBRANCA = 'Receber avisos de cobrança neste aparelho';
export const TEXTO_EXPLICA_COBRANCA =
  'Os mesmos avisos que chegam por e-mail: cobrança gerada, pagamento confirmado e pagamento em atraso dos grupos que você criou.';

const TEXTOS_COBRANCA: TextosAvisos = {
  rotulo: 'Controle dos avisos de cobrança',
  receber: TEXTO_RECEBER_COBRANCA,
  assinado: 'Você recebe neste aparelho os avisos de cobrança dos seus grupos.',
};

interface OfertaPushConta {
  oferecer: boolean;
  chavePublica: DisponibilidadePush['chavePublica'];
}

export const CHAVE_PUSH_CONTA = ['push', 'conta'] as const;

export interface PropsAvisosCobranca {
  /** Só para os testes: navegador e guarda falsos. */
  deps?: DependenciasPush;
}

export function AvisosCobranca({ deps }: PropsAvisosCobranca) {
  const api = useCliente();
  const dependencias = useMemo(() => deps ?? dependenciasPush(api), [deps, api]);
  const consulta = useQuery<OfertaPushConta>({
    queryKey: CHAVE_PUSH_CONTA,
    queryFn: () => api.get<OfertaPushConta>('/api/conta/push'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const dados = consulta.data;
  if (!dados?.oferecer || !dados.chavePublica || !dependencias.navegador.suporta) return null;

  return (
    <section className={estilos.secao} aria-labelledby="avisos-cobranca">
      <h2 id="avisos-cobranca" className={estilos.subtitulo}>
        {TITULO_AVISOS_COBRANCA}
      </h2>
      <p className={estilos.paragrafo}>{TEXTO_EXPLICA_COBRANCA}</p>
      <ControleAvisos
        destino={{ tipo: 'conta' }}
        chavePublica={dados.chavePublica}
        textos={TEXTOS_COBRANCA}
        deps={dependencias}
      />
    </section>
  );
}
