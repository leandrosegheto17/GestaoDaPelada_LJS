import { Link } from 'react-router';
import estilos from '../telas/acesso.module.css';

/** Link "Voltar" com a seta, acima do título (`a.voltar` do mockup; ACE-56). */
export function LinkVoltar({ para, children }: { para: string; children: string }) {
  return (
    <Link className={estilos.voltar} to={para}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}
