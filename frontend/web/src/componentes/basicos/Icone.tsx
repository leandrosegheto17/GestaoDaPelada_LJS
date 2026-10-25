import type { ReactNode } from 'react';

/** Catálogo único de ícones do app (traços copiados do mockup). Novos ícones entram aqui. */
const ICONES = {
  atencao: {
    traco: 2.2,
    desenho: (
      <>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
  },
  sucesso: { traco: 2.5, desenho: <path d="M20 6 9 17l-5-5" /> },
  info: {
    traco: 2.2,
    desenho: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </>
    ),
  },
  fechar: { traco: 2.5, desenho: <path d="M18 6 6 18M6 6l12 12" /> },
  baixar: { traco: 2.2, desenho: <path d="M12 5v14M19 12l-7 7-7-7" /> },
  subir: { traco: 2.2, desenho: <path d="M12 19V5M5 12l7-7 7 7" /> },
  engrenagem: {
    traco: 2,
    desenho: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
  lista: { traco: 2.2, desenho: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  conta: {
    traco: 2.2,
    desenho: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
  link: {
    traco: 1.8,
    desenho: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </>
    ),
  },
  proibido: {
    traco: 1.8,
    desenho: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M4.9 4.9l14.2 14.2" />
      </>
    ),
  },
  semConexao: {
    traco: 1.8,
    desenho: (
      <path d="M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5.1A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.4-2.7M8.5 16.1a5 5 0 0 1 7 0M12 20h.01" />
    ),
  },
  bola: {
    traco: 1.8,
    desenho: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7l3.5 2.5-1.3 4.1H9.8L8.5 9.5z" />
      </>
    ),
  },
  exportar: {
    traco: 2.5,
    desenho: (
      <>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </>
    ),
  },
  anterior: { traco: 2.5, desenho: <polyline points="15 18 9 12 15 6" /> },
  cadeado: {
    traco: 1.8,
    desenho: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  seguinte: { traco: 2.5, desenho: <polyline points="9 18 15 12 9 6" /> },
  atualizar: { traco: 2.2, desenho: <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /> },
} satisfies Record<string, { traco: number; desenho: ReactNode }>;

export type NomeIcone = keyof typeof ICONES | 'erro';

interface Props {
  nome: NomeIcone;
  tamanho?: number;
}

export function Icone({ nome, tamanho = 20 }: Props) {
  const { traco, desenho } = ICONES[nome === 'erro' ? 'atencao' : nome];
  return (
    <svg
      className="icone"
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {desenho}
    </svg>
  );
}
