import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';
import { juntar } from './juntar';
import estilos from './Faixa.module.css';

export type TipoFaixa = 'info' | 'sucesso' | 'atencao' | 'erro';
export type PapelFaixa = 'status' | 'alert' | 'note';

const ICONE: Record<TipoFaixa, NomeIcone> = { info: 'info', sucesso: 'sucesso', atencao: 'atencao', erro: 'erro' };

interface Props {
  tipo: TipoFaixa;
  topo?: boolean;
  /** Padrão: `alert` para erro, `status` para os demais. */
  papel?: PapelFaixa;
  children: ReactNode;
  /** Ação opcional (link ou botão de texto) ao lado da mensagem. */
  acao?: ReactNode;
  aoFechar?: () => void;
  /** Obrigatório com `aoFechar` (ex.: "Fechar aviso de instalação"). */
  rotuloFechar?: string;
  /** Classe extra para quem compõe a faixa (ex.: o resumo de erros). */
  className?: string;
  /** Omite o ícone de tipo (o resumo de erros do mockup não tem). */
  semIcone?: boolean;
}

export function Faixa({ tipo, topo, papel, children, acao, aoFechar, rotuloFechar, className, semIcone }: Props) {
  const papelFinal = papel ?? (tipo === 'erro' ? 'alert' : 'status');
  return (
    <div
      className={juntar(estilos.faixa, estilos[tipo], topo && estilos.topo, `faixa--${tipo}`, className)}
      role={papelFinal}
      aria-live={papelFinal === 'status' ? 'polite' : undefined}
    >
      {semIcone ? null : <Icone nome={ICONE[tipo]} />}
      <div className={estilos.texto}>{children}</div>
      {acao}
      {aoFechar ? (
        <button type="button" className={estilos.fechar} aria-label={rotuloFechar} onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      ) : null}
    </div>
  );
}
