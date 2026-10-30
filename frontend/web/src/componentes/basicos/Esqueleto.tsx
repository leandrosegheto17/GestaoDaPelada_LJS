import { juntar } from './juntar';
import { usarAtraso } from './usarAtraso';
import estilos from './Esqueleto.module.css';

export type VarianteEsqueleto = 'linha' | 'titulo' | 'bloco' | 'botao' | 'naBarra' | 'mes' | 'linhaTabela';

interface Props {
  variante?: VarianteEsqueleto;
  /** Repete o esqueleto (ex.: linhas de uma lista). */
  quantidade?: number;
}

/** O desenho do esqueleto, já visível: para telas que controlam o atraso por conta própria. */
export function FormaEsqueleto({ variante = 'bloco', quantidade = 1 }: Props) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: quantidade }, (_, i) => (
        <span key={i} className={juntar(estilos.esqueleto, estilos[variante])} />
      ))}
    </div>
  );
}

/** Esqueleto do título (`h1`) de uma tela cujo nome ainda não chegou (t16 carregando); decorativo, em linha. */
export function EsqueletoTitulo() {
  return <span aria-hidden="true" className={juntar(estilos.esqueleto, estilos.titulo)} />;
}

/** Só aparece depois de 300 ms; decorativo para leitores de tela. */
export function Esqueleto(props: Props) {
  const visivel = usarAtraso(300);
  return visivel ? <FormaEsqueleto {...props} /> : null;
}
