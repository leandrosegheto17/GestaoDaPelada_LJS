import { BarraInterna, type PropsMenuConta } from './BarraInterna';

interface Props extends PropsMenuConta {
  /** Sem grupo selecionado, mostra "Gestão da Pelada". */
  nomeGrupo?: string;
  destinoTrocarGrupo?: string;
  destinoRanking?: string;
}

export function BarraAdmin({ nomeGrupo, destinoTrocarGrupo, destinoRanking, ...menu }: Props) {
  return (
    <BarraInterna
      nome={nomeGrupo ?? 'Gestão da Pelada'}
      textoLink="Trocar grupo"
      {...(destinoTrocarGrupo ? { destinoLink: destinoTrocarGrupo } : {})}
      {...(destinoRanking ? { destinoRanking } : {})}
      {...menu}
    />
  );
}
