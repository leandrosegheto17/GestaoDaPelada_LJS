import { Casca } from '../../componentes/Casca.tsx';
import { TelaMensagem } from '../../componentes/TelaMensagem.tsx';

/**
 * Grupo indisponível (t03; partidas-e-ranking T57; PAR-94), de `.specs/mockup/telas/t03-indisponivel--erro.html`:
 * a mesma tela para o 404 da API (slug que não existe, grupo arquivado ou slug malformado, sem distinguir; PAR-90) e
 * para o slug malformado no endereço, que nem chega a chamar a API.
 */

export const TEXTO_INDISPONIVEL = 'Grupo indisponível';
export const TEXTO_INDISPONIVEL_AJUDA =
  'Este grupo não está disponível no momento. Fale com o admin do seu grupo.';

/**
 * Formato do slug público, o mesmo `SLUG_PUBLICO` da API (`backend/api/src/entrada/middlewares/contexto-publico.ts:24`):
 * minúsculas, dígitos e hífen, de 1 a 64. O front não importa da API, então a regra se repete aqui.
 */
export const FORMATO_SLUG_PUBLICO = /^[a-z0-9-]{1,64}$/;

export function ehSlugValido(slug: string): boolean {
  return FORMATO_SLUG_PUBLICO.test(slug);
}

export function GrupoIndisponivel() {
  return (
    <Casca centralizada>
      <TelaMensagem icone="erro" titulo={TEXTO_INDISPONIVEL}>
        {TEXTO_INDISPONIVEL_AJUDA}
      </TelaMensagem>
    </Casca>
  );
}
