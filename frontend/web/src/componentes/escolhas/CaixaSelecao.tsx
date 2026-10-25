import estilos from './CaixaSelecao.module.css';

interface Props {
  rotulo?: string;
  /** Vira `aria-label` quando não há rótulo visível. */
  rotuloAcessivel?: string;
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  desabilitada?: boolean;
}

export function CaixaSelecao({ rotulo, rotuloAcessivel, marcada, aoMudar, desabilitada }: Props) {
  return (
    <label className={estilos.caixa}>
      <input
        type="checkbox"
        aria-label={rotulo ? undefined : rotuloAcessivel}
        checked={marcada}
        disabled={desabilitada}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      {rotulo ? <span>{rotulo}</span> : null}
    </label>
  );
}
