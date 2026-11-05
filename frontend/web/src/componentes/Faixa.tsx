import type { ReactNode } from 'react';
import estilos from './Faixa.module.css';

/**
 * Faixa de aviso (ACE-56), de `t32-conta--excluida.html` (`faixa--sucesso`, `role="status"`),
 * `t30-confirmar--invalido.html` (`faixa--atencao`, `role="status"`) e `t05-esqueci--erro.html`
 * (`faixa--erro`). Erro é `role="alert"` (interrompe o leitor de tela); o resto, `role="status"`.
 */

export type TipoFaixa = 'sucesso' | 'erro' | 'atencao' | 'info';

export interface PropsFaixa {
  tipo: TipoFaixa;
  /** Título em negrito, antes do texto (`faixa__texto strong`). */
  titulo?: string;
  children?: ReactNode;
  /** Ação à direita (ex.: "Reenviar link"). */
  acao?: ReactNode;
}

function Icone({ tipo }: { tipo: TipoFaixa }) {
  const comum = {
    className: estilos.icone,
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (tipo === 'sucesso') {
    return (
      <svg {...comum} strokeWidth="2.5">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (tipo === 'info') {
    return (
      <svg {...comum} strokeWidth="2.2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    );
  }
  return (
    <svg {...comum} strokeWidth="2.2">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function Faixa({ tipo, titulo, children, acao }: PropsFaixa) {
  return (
    <div className={`${estilos.faixa} ${estilos[`faixa--${tipo}`]}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone tipo={tipo} />
      {titulo ? (
        <div className={estilos['faixa__texto']}>
          <strong>{titulo}</strong>
          {children}
        </div>
      ) : (
        <p className={estilos['faixa__texto']}>{children}</p>
      )}
      {acao ? <span className={estilos.acao}>{acao}</span> : null}
    </div>
  );
}
