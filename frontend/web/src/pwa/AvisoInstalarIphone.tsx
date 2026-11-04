import estilos from './AvisoInstalarIphone.module.css';
import { useModoInstalacao } from './useModoInstalacao.ts';

/** Faixa de instalação para o Safari do iPhone fora do app instalado; dispensada, não volta. */
export function AvisoInstalarIphone() {
  const { mostrar, dispensar } = useModoInstalacao();
  if (!mostrar) return null;
  return (
    <div className={estilos.faixa} role="note">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <p className={estilos.texto}>
        Instale: toque em Compartilhar e depois em “Adicionar à Tela de Início”.
      </p>
      <button
        type="button"
        className={estilos.fechar}
        aria-label="Fechar aviso de instalação"
        onClick={dispensar}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
