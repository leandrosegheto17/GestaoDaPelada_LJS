import estilos from './EsqueletoLista.module.css';

/**
 * Carregando de lista (FUN-31), de `.specs/mockup/telas/padrao--carregando-lista.html`: o
 * leitor de tela ouve "Carregando…" (`role="status"`), as linhas são decorativas e a área fica
 * com `aria-busy`. Sem animação com `prefers-reduced-motion` (no CSS Module).
 */

export const LINHAS_PADRAO = 6;

export interface PropsEsqueletoLista {
  linhas?: number;
  rotulo?: string;
}

export function EsqueletoLista({
  linhas = LINHAS_PADRAO,
  rotulo = 'Carregando…',
}: PropsEsqueletoLista) {
  const total = Math.max(0, Math.floor(linhas));
  return (
    <div aria-busy="true">
      <p className="sr" role="status">
        {rotulo}
      </p>
      <div className={estilos.lista} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`${estilos.esqueleto} ${estilos['esqueleto--bloco']}`} />
        ))}
      </div>
    </div>
  );
}
