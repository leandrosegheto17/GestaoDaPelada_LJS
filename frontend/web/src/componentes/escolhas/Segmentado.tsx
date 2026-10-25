import { useId } from 'react';
import { juntar } from '../basicos/juntar';
import estilos from './Segmentado.module.css';

export interface OpcaoSegmentada<T extends string> {
  valor: T;
  rotulo: string;
}

interface Props<T extends string> {
  legenda: string;
  /** Legenda visível; por padrão fica só para leitores de tela. */
  legendaVisivel?: boolean;
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  aoMudar: (valor: T) => void;
}

/** Grupo de rádios nativo: setas, Tab único e `radiogroup` implícito vêm do navegador. */
export function Segmentado<T extends string>({ legenda, legendaVisivel, opcoes, valor, aoMudar }: Props<T>) {
  const nome = useId();
  return (
    <fieldset className={estilos.segmentado}>
      <legend className={juntar(!legendaVisivel && 'sr')}>{legenda}</legend>
      {opcoes.map((o) => (
        <label key={o.valor} className={estilos.opcao}>
          <input type="radio" name={nome} checked={o.valor === valor} onChange={() => aoMudar(o.valor)} />
          <span>{o.rotulo}</span>
        </label>
      ))}
    </fieldset>
  );
}
