import estilos from './Indicadores.module.css';

export interface ItemIndicador {
  rotulo: string;
  valor: string;
}

/** Pares rótulo/valor em lista de definição (cartão de semana, cartão de time). Só mostra o que recebe. */
export function Indicadores({ itens }: { itens: readonly ItemIndicador[] }) {
  return (
    <dl className={estilos.indicadores}>
      {itens.map((i) => (
        <div key={i.rotulo} className={estilos.par}>
          <dt>{i.rotulo}</dt>
          <dd>{i.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
