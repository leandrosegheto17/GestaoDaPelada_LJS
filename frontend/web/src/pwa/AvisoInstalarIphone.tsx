import estilos from './AvisoInstalarIphone.module.css';
import { useModoInstalacao, type AmbienteNavegador } from './useModoInstalacao.ts';

/**
 * Instrução de instalação no iPhone (FUN-36), de `.specs/mockup/telas/t01-ranking--instalar-iphone.html`:
 * faixa informativa no topo, com o botão de fechar. Fechar grava a dispensa.
 */

export const TEXTO_AVISO = 'Instale: toque em Compartilhar e depois em “Adicionar à Tela de Início”.';

export interface PropsAvisoInstalarIphone {
  /** Só para os testes: o navegador simulado. */
  ambiente?: AmbienteNavegador;
}

export function AvisoInstalarIphone({ ambiente }: PropsAvisoInstalarIphone) {
  const { mostrarAviso, dispensar } = useModoInstalacao(ambiente);
  if (!mostrarAviso) return null;
  return (
    <div className={`${estilos.faixa} ${estilos['faixa--info']} ${estilos['faixa--topo']}`} role="note">
      <svg
        className={estilos.icone}
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
      <p className={estilos['faixa__texto']}>{TEXTO_AVISO}</p>
      <button className={estilos['faixa__fechar']} type="button" aria-label="Fechar aviso de instalação" onClick={dispensar}>
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
