import estilos from './Interruptor.module.css';

interface Props {
  /** Rótulo visível. Sem ele, `rotuloAcessivel` é obrigatório. */
  rotulo?: string;
  /** Vira `aria-label` quando não há rótulo visível (ex.: "Acessa financeiro: Leandro"). */
  rotuloAcessivel?: string;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  /** Texto visível do estado (ex.: "Sim"). Igual ao desligado = texto fixo. */
  textoLigado: string;
  textoDesligado: string;
  desabilitado?: boolean;
  /** `id` do texto que explica o interruptor (ex.: por que está desabilitado). */
  descritoPor?: string;
}

/** Controlado: o estado é do chamador. O leitor de tela lê o estado pelo `aria-checked` do switch. */
export function Interruptor({
  rotulo,
  rotuloAcessivel,
  marcado,
  aoMudar,
  textoLigado,
  textoDesligado,
  desabilitado,
  descritoPor,
}: Props) {
  return (
    <label className={estilos.interruptor}>
      {rotulo ? <span>{rotulo}</span> : null}
      <input
        type="checkbox"
        role="switch"
        aria-label={rotulo ? undefined : rotuloAcessivel}
        aria-describedby={descritoPor}
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className={estilos.trilho} aria-hidden="true" />
      <span className={estilos.estado} aria-hidden="true">
        {marcado ? textoLigado : textoDesligado}
      </span>
    </label>
  );
}
