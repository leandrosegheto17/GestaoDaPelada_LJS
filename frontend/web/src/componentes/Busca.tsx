import estilosCampo from './Campo.module.css';
import estilos from './Busca.module.css';

/**
 * Busca da lista (GEL-115, GEL-48), da marcação de `t15-jogadores--sucesso.html`:
 * `div.ferramentas-lista` com `input type="search"`, rótulo só para leitor de tela (`.sr`) e o
 * mesmo texto no `placeholder`. Quem usa filtra (ex.: `chaveBusca`, sem acento e sem caixa).
 */

export interface PropsBusca {
  id: string;
  /** Rótulo e placeholder (ex.: "Buscar jogador"). */
  rotulo: string;
  valor: string;
  aoMudar: (texto: string) => void;
}

export function Busca({ id, rotulo, valor, aoMudar }: PropsBusca) {
  return (
    <div className={estilos.ferramentas}>
      <div className={[estilosCampo.campo, estilos.campo].join(' ')}>
        <label className="sr" htmlFor={id}>
          {rotulo}
        </label>
        <input
          id={id}
          className={estilosCampo['campo__entrada']}
          type="search"
          placeholder={rotulo}
          autoComplete="off"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      </div>
    </div>
  );
}
