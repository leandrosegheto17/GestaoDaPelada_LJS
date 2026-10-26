import { BarraInterna, type PropsMenuConta } from './BarraInterna';

interface Props extends PropsMenuConta {
  /** Só quando o dono também é admin de algum grupo. */
  destinoMeusGrupos?: string;
}

/** Só deve ser montada quando a sessão é do dono; a autorização real é da API. */
export function BarraDono({ destinoMeusGrupos, ...menu }: Props) {
  return (
    <BarraInterna
      nome="Área do dono"
      textoLink="Meus grupos como admin"
      {...(destinoMeusGrupos ? { destinoLink: destinoMeusGrupos } : {})}
      {...menu}
    />
  );
}
