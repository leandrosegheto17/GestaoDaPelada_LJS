import type { DisponibilidadePush } from '@pelada/contrato/push';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { AvisoInstalarIphone } from '../../pwa/AvisoInstalarIphone.tsx';
import { ehSafariIos, lerAmbiente, type AmbienteNavegador } from '../../pwa/useModoInstalacao.ts';
import {
  assinar,
  cancelar,
  dependenciasPush,
  estado as estadoDoAparelho,
  type DependenciasPush,
  type Destino,
  type EstadoPushLocal,
} from '../../push/assinatura.ts';
import estilos from './ControlePush.module.css';

/**
 * Controle "Receber avisos do ranking" na t01 (notificacoes T37; NOT-01, NOT-03, NOT-04, NOT-13, NOT-15, NOT-61,
 * NOT-71, NOT-72; AD-072, AD-111). Montado só com `Botao` e `Faixa` do guia e os tokens.
 *
 * - `GET /api/publico/:slug/push` que falha ou diz `disponivel: false` (Free, sem VAPID): nada na tela (NOT-61). Como
 *   o runner da comparação visual não simula essa rota, a t01 comparada não muda (AD-072);
 * - Safari do iOS fora do standalone: o aviso de instalação (FUN-36) no mesmo contêiner, sem o botão e sem pedir a
 *   permissão (NOT-03): no iOS o push só existe no app instalado;
 * - estados: "Receber avisos do ranking"; assinado, com "Parar de receber avisos" (NOT-13, NOT-15); avisos desligados,
 *   com como ligar nas configurações (NOT-04); sem suporte;
 * - permissão `granted` sem assinatura no servidor: de novo "Receber avisos do ranking" (NOT-71, pelo `estado`);
 * - a permissão só é pedida no toque do botão (NOT-02, pelo `assinar`).
 *
 * `ControleAvisos` é a parte comum com os avisos de cobrança em Minha conta (T38), que muda só os textos e o destino.
 */

export const TEXTO_RECEBER_RANKING = 'Receber avisos do ranking';
export const TEXTO_ASSINADO_RANKING =
  'Você recebe um aviso neste aparelho quando o ranking for atualizado.';
export const TEXTO_PARAR = 'Parar de receber avisos';
export const TITULO_DESLIGADO = 'Avisos desligados';
export const TEXTO_DESLIGADO =
  'Para ligar, permita as notificações deste site nas configurações do navegador.';
export const TEXTO_SEM_SUPORTE = 'Este navegador não recebe avisos.';
export const TEXTO_ERRO_AVISOS = 'Não foi possível mudar os avisos. Tente de novo.';

export interface TextosAvisos {
  rotulo: string;
  receber: string;
  assinado: string;
}

const TEXTOS_RANKING: TextosAvisos = {
  rotulo: 'Avisos do ranking',
  receber: TEXTO_RECEBER_RANKING,
  assinado: TEXTO_ASSINADO_RANKING,
};

export interface PropsControleAvisos {
  destino: Destino;
  chavePublica: string;
  textos: TextosAvisos;
  deps: DependenciasPush;
}

/** Os estados e as ações de um destino de push, com os componentes do guia. */
export function ControleAvisos({ destino, chavePublica, textos, deps }: PropsControleAvisos) {
  const [estado, setEstado] = useState<EstadoPushLocal | 'lendo'>('lendo');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chaveDestino = destino.tipo === 'conta' ? 'conta' : `ranking:${destino.slug}`;

  useEffect(() => {
    let vivo = true;
    estadoDoAparelho(destino, chavePublica, deps)
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado('nao_assinado'));
    return () => {
      vivo = false;
    };
    // `destino` muda de identidade a cada render; a chave textual decide.
  }, [chaveDestino, chavePublica, deps]);

  const agir = (acao: () => Promise<EstadoPushLocal>) => {
    setOcupado(true);
    setErro(null);
    acao()
      .then(setEstado)
      .catch((e: unknown) => setErro(e instanceof ErroApi ? e.message : TEXTO_ERRO_AVISOS))
      .finally(() => setOcupado(false));
  };

  if (estado === 'lendo') return null;
  return (
    <section className={estilos.controle} aria-label={textos.rotulo} aria-live="polite">
      {erro ? <Faixa tipo="erro">{erro}</Faixa> : null}
      {estado === 'sem_suporte' ? <p className={estilos.texto}>{TEXTO_SEM_SUPORTE}</p> : null}
      {estado === 'desligado' ? (
        <Faixa tipo="info" titulo={TITULO_DESLIGADO}>
          <span> {TEXTO_DESLIGADO}</span>
        </Faixa>
      ) : null}
      {estado === 'nao_assinado' ? (
        <Botao
          variante="secundario"
          carregando={ocupado}
          onClick={() => agir(() => assinar(destino, chavePublica, deps))}
        >
          {textos.receber}
        </Botao>
      ) : null}
      {estado === 'assinado' ? (
        <>
          <p className={estilos.texto}>{textos.assinado}</p>
          <Botao
            variante="texto"
            carregando={ocupado}
            onClick={() => agir(() => cancelar(destino, deps))}
          >
            {TEXTO_PARAR}
          </Botao>
        </>
      ) : null}
    </section>
  );
}

export function chaveDisponibilidadePush(slug: string) {
  return ['push', 'publico', slug] as const;
}

export interface PropsControlePush {
  slug: string;
  /** Só para os testes: navegador e guarda falsos. */
  deps?: DependenciasPush;
  /** Só para os testes: o navegador simulado (Safari do iOS). */
  ambiente?: AmbienteNavegador;
}

export function ControlePush({ slug, deps, ambiente }: PropsControlePush) {
  const api = useCliente();
  const dependencias = useMemo(() => deps ?? dependenciasPush(api), [deps, api]);
  const [navegador] = useState(() => ambiente ?? lerAmbiente());
  const consulta = useQuery<DisponibilidadePush>({
    queryKey: chaveDisponibilidadePush(slug),
    queryFn: () => api.get<DisponibilidadePush>(`/api/publico/${encodeURIComponent(slug)}/push`),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const dados = consulta.data;
  if (!dados || !dados.disponivel || !dados.chavePublica) return null;

  // NOT-03: no Safari do iOS fora do app instalado, a instrução do FUN-36 no lugar do controle.
  if (ehSafariIos(navegador) && !navegador.standalone) {
    return (
      <section className={estilos.controle} aria-label={TEXTOS_RANKING.rotulo}>
        <AvisoInstalarIphone ambiente={navegador} />
      </section>
    );
  }

  return (
    <ControleAvisos
      destino={{ tipo: 'ranking', slug }}
      chavePublica={dados.chavePublica}
      textos={TEXTOS_RANKING}
      deps={dependencias}
    />
  );
}
