import { useEffect, useRef, type ReactNode } from 'react';
import estilos from './TelaMensagem.module.css';

/**
 * Tela de mensagem (ACE-56): ícone, título, texto e ação, no padrão `tela-mensagem` do mockup
 * (`.specs/mockup/base.css:228-232`; molde do `EstadoErro` formato tela). Vai dentro da
 * `Casca centralizada`. O foco vai ao título quando a tela aparece, para o leitor de tela
 * anunciar o resultado (confirmação, link inválido).
 */

export type IconeTelaMensagem = 'sucesso' | 'erro' | 'email';

export interface PropsTelaMensagem {
  icone: IconeTelaMensagem;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
}

function Icone({ tipo }: { tipo: IconeTelaMensagem }) {
  const classe = [estilos['vazio__icone'], tipo === 'erro' ? estilos['vazio__icone--erro'] : '']
    .filter(Boolean)
    .join(' ');
  const comum = {
    className: classe,
    viewBox: '0 0 24 24',
    width: 56,
    height: 56,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (tipo === 'sucesso') {
    return (
      <svg {...comum}>
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    );
  }
  if (tipo === 'email') {
    return (
      <svg {...comum}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function TelaMensagem({ icone, titulo, children, acao }: PropsTelaMensagem) {
  const refTitulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    refTitulo.current?.focus();
  }, []);
  return (
    <>
      <Icone tipo={icone} />
      <h1 className={estilos['vazio__titulo']} ref={refTitulo} tabIndex={-1}>
        {titulo}
      </h1>
      {children ? <p className={estilos['vazio__texto']}>{children}</p> : null}
      {acao}
    </>
  );
}
