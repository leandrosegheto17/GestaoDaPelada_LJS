import estilos from './EstadoErro.module.css';

interface EstadoErroProps {
  mensagem?: string;
  aoTentarDeNovo: () => void;
}

/**
 * Erro de rede ou de servidor (padrão do mockup, padrao--erro-rede). O `role="alert"` anuncia a mensagem; o foco
 * não se move sozinho, como no mockup.
 */
export function EstadoErro({
  mensagem = 'Não foi possível carregar. Verifique a conexão.',
  aoTentarDeNovo,
}: EstadoErroProps) {
  return (
    <div className={estilos.faixa} role="alert">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <p className={estilos.texto}>{mensagem}</p>
      <button type="button" className={estilos.tentar} onClick={aoTentarDeNovo}>
        Tentar de novo
      </button>
    </div>
  );
}
