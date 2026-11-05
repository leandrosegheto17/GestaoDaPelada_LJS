import type { ReactNode } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import casca from '../../componentes/Casca.module.css';
import { Faixa } from '../../componentes/Faixa.tsx';
import { TelaMensagem } from '../../componentes/TelaMensagem.tsx';
import pagina from './ranking.module.css';

/**
 * Ranking sem conexão (partidas-e-ranking T73; PAR-149 a PAR-152), de
 * `.specs/mockup/telas/t01-ranking--{sem-conexao,sem-conexao-admin,carregando-cache,erro}.html`:
 * - com o ranking guardado e sem rede: a faixa "Sem conexão, atualizado em dd/mm hh:mm", com a hora do `geradoEm` em
 *   São Paulo, e a tela somente leitura (PAR-149);
 * - a engrenagem de admin, sem rede, responde "É preciso conexão para entrar." (PAR-150);
 * - sem guardado: "Sem conexão", "Conecte-se para ver o ranking." e "Tentar de novo" (PAR-151);
 * - mostrando o guardado enquanto a rede responde: "atualizando…" no resumo do mês (PAR-152).
 */

export const TEXTO_SEM_CONEXAO = 'Sem conexão';
export const TEXTO_SEM_CONEXAO_AJUDA = 'Conecte-se para ver o ranking.';
export const TEXTO_PRECISA_CONEXAO = 'É preciso conexão para entrar.';
export const TEXTO_ATUALIZANDO = 'atualizando…';

const DIA_HORA_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Sem conexão, atualizado em 15/10 22:30" do `geradoEm` (instante ISO), na hora de São Paulo (PAR-149). */
export function textoAtualizadoEm(geradoEm: string): string {
  const partes = DIA_HORA_SP.formatToParts(new Date(geradoEm));
  const v = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `Sem conexão, atualizado em ${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
}

/** O navegador diz que está sem rede (`navigator.onLine` falso). */
export function navegadorSemRede(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function FaixaSemConexao({ geradoEm }: { geradoEm: string }) {
  return (
    <div className={pagina['faixa-topo']}>
      <Faixa tipo="atencao">{textoAtualizadoEm(geradoEm)}</Faixa>
    </div>
  );
}

export function FaixaPrecisaConexao() {
  return <Faixa tipo="erro">{TEXTO_PRECISA_CONEXAO}</Faixa>;
}

function IconeAtualizar() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
    </svg>
  );
}

/** "atualizando…" do resumo do mês (t01 carregando-cache; PAR-152). */
export function IndicadorAtualizando() {
  return (
    <span className={pagina.atualizando} role="status">
      <IconeAtualizar />
      {TEXTO_ATUALIZANDO}
    </span>
  );
}

/** Sem rede e sem guardado (t01 erro; PAR-151). */
export function TelaSemConexao({ aoTentar, aviso }: { aoTentar: () => void; aviso?: ReactNode }) {
  return (
    <main className={casca['tela-mensagem']}>
      {aviso}
      <TelaMensagem
        icone="erro"
        titulo={TEXTO_SEM_CONEXAO}
        acao={
          <Botao variante="secundario" onClick={aoTentar}>
            Tentar de novo
          </Botao>
        }
      >
        <span role="alert">{TEXTO_SEM_CONEXAO_AJUDA}</span>
      </TelaMensagem>
    </main>
  );
}
