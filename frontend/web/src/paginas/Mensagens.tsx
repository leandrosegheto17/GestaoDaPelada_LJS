import { useSearchParams } from 'react-router';
import { Casca } from '../componentes/Casca.tsx';
import { EstadoErro } from '../componentes/EstadoErro.tsx';
import { Faixa } from '../componentes/Faixa.tsx';

/**
 * Páginas de mensagem da fundação, na casca de `t03-indisponivel--erro` com texto próprio
 * (AD-007): a página provisória de `/` e o 404.
 *
 * Em `/?aviso=conta-excluida`, a página provisória mostra por cima a faixa de sucesso
 * "Sua conta foi excluída." (ACE-28, `t32-conta--excluida.html`); a landing fica na
 * `planos-e-cobranca` (AD-023).
 */

export const TEXTO_EM_BREVE = 'O Gestão da Pelada está sendo preparado. Volte em breve.';
export const TEXTO_CONTA_EXCLUIDA = 'Sua conta foi excluída.';

export function PaginaProvisoria() {
  const [parametros] = useSearchParams();
  return (
    <Casca centralizada>
      {parametros.get('aviso') === 'conta-excluida' ? (
        <Faixa tipo="sucesso">{TEXTO_CONTA_EXCLUIDA}</Faixa>
      ) : null}
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
