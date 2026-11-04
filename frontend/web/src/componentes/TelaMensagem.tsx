import estilos from './TelaMensagem.module.css';

interface TelaMensagemProps {
  titulo: string;
  texto: string;
}

/** Tela de uma mensagem só (t03-indisponivel--erro): ícone, título e texto centralizados. */
export function TelaMensagem({ titulo, texto }: TelaMensagemProps) {
  return (
    <div className={estilos.tela}>
      <svg
        className={estilos.icone}
        viewBox="0 0 24 24"
        width="56"
        height="56"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M4.9 4.9l14.2 14.2" />
      </svg>
      <h1 className={estilos.titulo}>{titulo}</h1>
      <p className={estilos.texto}>{texto}</p>
    </div>
  );
}
