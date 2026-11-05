import estilosCampo from './Campo.module.css';
import estilos from './CampoNota.module.css';

/**
 * Nota de uma habilidade (GEL-115, GEL-97, GEL-98), da marcação de `t16-jogador--edicao.html`:
 * dentro de um item da lista, o rótulo é o nome da habilidade (`item__principal`) e a entrada é
 * um `select.campo__entrada--nota` com "–" (sem nota: limpar, que envia `null`, GEL-98) e as
 * notas inteiras de 1 a 10 (GEL-97). Com erro, o mesmo padrão do `Campo`.
 */

export const NOTAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface PropsCampoNota {
  id: string;
  /** Nome da habilidade. */
  rotulo: string;
  /** Nota atual; `null` sem nota. */
  valor: number | null;
  aoMudar: (nota: number | null) => void;
  erro?: string | undefined;
  desabilitado?: boolean | undefined;
}

export function CampoNota({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  desabilitado = false,
}: PropsCampoNota) {
  const idErro = erro ? `${id}-erro` : undefined;
  return (
    <>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      <select
        id={id}
        className={[
          estilosCampo['campo__entrada'],
          estilos['campo__entrada--nota'],
          erro ? estilos.erro : '',
        ]
          .filter(Boolean)
          .join(' ')}
        value={valor === null ? '' : String(valor)}
        disabled={desabilitado || undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={idErro}
        onChange={(e) => {
          const texto = e.target.value;
          aoMudar(texto === '' ? null : Number(texto));
        }}
      >
        <option value="" aria-label="Sem nota">
          –
        </option>
        {NOTAS.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
      {erro ? (
        <p className={estilosCampo['campo__erro']} id={idErro}>
          {erro}
        </p>
      ) : null}
    </>
  );
}
