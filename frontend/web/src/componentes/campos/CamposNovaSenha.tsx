import { LIMITES } from '@pelada/contrato';
import { CampoSenha } from './CampoSenha';

export const ID_NOVA_SENHA = 'nova';
export const ID_CONFIRMACAO = 'conf';

interface Props {
  nova: string;
  confirmacao: string;
  aoMudarNova: (valor: string) => void;
  aoMudarConfirmacao: (valor: string) => void;
  erros: { novaSenha?: string | undefined; confirmacao?: string | undefined };
  /** Com um único erro na tela (sem resumo), o erro do campo vira `role=alert`. */
  erroComoAlerta?: boolean;
}

/** Par "Nova senha" + "Confirmar nova senha", com a regra do contrato visível. Sem "Mostrar". */
export function CamposNovaSenha({ nova, confirmacao, aoMudarNova, aoMudarConfirmacao, erros, erroComoAlerta }: Props) {
  return (
    <>
      <CampoSenha
        id={ID_NOVA_SENHA}
        rotulo="Nova senha"
        autoComplete="new-password"
        comMostrar={false}
        ajuda={`De ${LIMITES.senha.min} a ${LIMITES.senha.max} caracteres.`}
        erro={erros.novaSenha}
        {...(erroComoAlerta ? { erroComoAlerta } : {})}
        valor={nova}
        aoMudar={aoMudarNova}
      />
      <CampoSenha
        id={ID_CONFIRMACAO}
        rotulo="Confirmar nova senha"
        autoComplete="new-password"
        comMostrar={false}
        erro={erros.confirmacao}
        {...(erroComoAlerta ? { erroComoAlerta } : {})}
        valor={confirmacao}
        aoMudar={aoMudarConfirmacao}
      />
    </>
  );
}
