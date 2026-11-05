import type { CorrigirPeriodoCorpo } from '@pelada/contrato/elenco';
import { previaInicioResposta, previaResposta, type PreviaInicioResposta, type PreviaResposta } from '@pelada/contrato/previas';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo } from './grupos.ts';

/**
 * Prévias de período na ficha do jogador (partidas-e-ranking T66; PAR-110, PAR-111, PAR-120):
 * - `usePrevia(pedir, chave)`: pede a prévia 300 ms depois da última troca da `chave` (as datas do diálogo); o
 *   estado é `calculando` desde a troca até a resposta, `pronta`, `erro` ou `ocioso` (sem o que pedir: data vazia);
 *   uma resposta velha (de uma chave anterior) é descartada;
 * - `usePedirPrevias(grupoId, jogadorId)`: as três chamadas, `POST …/reativar/previa`, `…/periodos/:periodoId/previa`
 *   e `…/inicio/previa`, conferidas pelo contrato.
 */

export const ATRASO_PREVIA_MS = 300;
export const TEXTO_CALCULANDO = 'Calculando…';
export const TEXTO_ERRO_PREVIA = 'Não foi possível calcular. Verifique a conexão.';

export type EstadoPrevia<T> =
  | { tipo: 'ocioso' }
  | { tipo: 'calculando' }
  | { tipo: 'pronta'; previa: T }
  | { tipo: 'erro'; erro: unknown };

export function usePrevia<T>(pedir: (() => Promise<T>) | null, chave: string, atrasoMs = ATRASO_PREVIA_MS) {
  const [estado, setEstado] = useState<EstadoPrevia<T>>(pedir ? { tipo: 'calculando' } : { tipo: 'ocioso' });
  const [tentativa, setTentativa] = useState(0);
  const refPedir = useRef(pedir);

  useEffect(() => {
    refPedir.current = pedir;
  });

  useEffect(() => {
    const atual = refPedir.current;
    if (!atual) {
      setEstado({ tipo: 'ocioso' });
      return;
    }
    setEstado({ tipo: 'calculando' });
    let vivo = true;
    const espera = setTimeout(() => {
      atual().then(
        (previa) => {
          if (vivo) setEstado({ tipo: 'pronta', previa });
        },
        (erro: unknown) => {
          if (vivo) setEstado({ tipo: 'erro', erro });
        },
      );
    }, atrasoMs);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [chave, atrasoMs, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { estado, tentarDeNovo };
}

export function usePedirPrevias(grupoId: string, jogadorId: string) {
  const api = useCliente();
  const base = `${caminhoGrupo(grupoId)}/jogadores/${encodeURIComponent(jogadorId)}`;
  return {
    reativar: async (data: string): Promise<PreviaResposta> =>
      previaResposta.parse(await api.post<unknown>(`${base}/reativar/previa`, { data })),
    periodo: async (periodoId: string, dados: CorrigirPeriodoCorpo): Promise<PreviaResposta> =>
      previaResposta.parse(await api.post<unknown>(`${base}/periodos/${encodeURIComponent(periodoId)}/previa`, dados)),
    inicio: async (data: string): Promise<PreviaInicioResposta> =>
      previaInicioResposta.parse(await api.post<unknown>(`${base}/inicio/previa`, { data })),
  };
}
