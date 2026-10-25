import { Botao } from './Botao';
import { Faixa } from './Faixa';

interface Props {
  aoTentar: () => void;
}

export function ErroRede({ aoTentar }: Props) {
  return (
    <Faixa
      tipo="erro"
      acao={
        <Botao variante="texto" onClick={aoTentar}>
          Tentar de novo
        </Botao>
      }
    >
      Não foi possível carregar. Verifique a conexão.
    </Faixa>
  );
}
