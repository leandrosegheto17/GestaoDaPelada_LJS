import { juntar } from './juntar';
import estilos from './Selo.module.css';

/** Confirmação discreta de que a alteração foi gravada ("salvo"); anunciada como status. */
export function SeloSalvo({ texto = 'salvo' }: { texto?: string }) {
  return (
    <span className={juntar(estilos.selo, estilos.sucesso)} role="status">
      {texto}
    </span>
  );
}
