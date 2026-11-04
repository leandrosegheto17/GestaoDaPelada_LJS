import estilos from './EsqueletoLista.module.css';

interface EsqueletoListaProps {
  linhas?: number;
}

/** Carregando de lista (padrão do mockup, padrao--carregando-lista): o leitor de tela ouve só "Carregando…". */
export function EsqueletoLista({ linhas = 6 }: EsqueletoListaProps) {
  return (
    <div aria-busy="true">
      <p className={estilos.sr} role="status">
        Carregando…
      </p>
      <div className={estilos.lista} aria-hidden="true" data-testid="esqueleto-lista">
        {Array.from({ length: linhas }, (_, i) => (
          <span key={i} className={estilos.linha} />
        ))}
      </div>
    </div>
  );
}
