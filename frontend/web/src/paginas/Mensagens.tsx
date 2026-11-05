import { Casca } from '../componentes/Casca.tsx';
import { EstadoErro } from '../componentes/EstadoErro.tsx';

/**
 * Páginas de mensagem da fundação, na casca de `t03-indisponivel--erro` com texto próprio
 * (AD-007): a página provisória de `/` e o 404.
 */

export const TEXTO_EM_BREVE = 'O Gestão da Pelada está sendo preparado. Volte em breve.';

export function PaginaProvisoria() {
  return (
    <Casca centralizada>
      <EstadoErro formato="tela" titulo="Em breve" mensagem={TEXTO_EM_BREVE} />
    </Casca>
  );
}

export function NaoEncontrada() {
  return (
    <Casca centralizada>
      <EstadoErro
        formato="tela"
        titulo="Página não encontrada"
        mensagem="O endereço que você abriu não existe. Confira o link e tente de novo."
      />
    </Casca>
  );
}
