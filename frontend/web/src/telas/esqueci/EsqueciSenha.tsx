import { emailCorpo, LIMITES } from '@pelada/contrato';
import { useState } from 'react';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { escrever, semCorpo } from '../../dados/cliente';
import { ehEmailIndisponivel, TEXTO_EMAIL_INDISPONIVEL } from '../compartilhado/falhas';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';

const TEXTO_ENVIADO =
  'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.';

/** T05: pedir o link de recuperação por e-mail. A resposta é a mesma exista ou não a conta (ACE-22). */
export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [falha, setFalha] = useState<'indisponivel' | 'conexao' | null>(null);

  const enviar = async () => {
    setFalha(null);
    const analise = emailCorpo.safeParse({ email });
    if (!analise.success) {
      setErroEmail(analise.error.issues[0]?.message ?? 'Informe um e-mail válido.');
      return;
    }
    setErroEmail(undefined);
    setEnviando(true);
    try {
      await escrever('POST', '/sessao/esqueci-senha', { email }, semCorpo);
      setEnviado(true);
    } catch (erro) {
      setFalha(ehEmailIndisponivel(erro) ? 'indisponivel' : 'conexao');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <PaginaAcesso titulo="Esqueci a senha">
        <Faixa tipo="info">{TEXTO_ENVIADO}</Faixa>
        <div className="acima-3">
          <BotaoLink to="/entrar" variante="secundario" bloco>
            Voltar para entrar
          </BotaoLink>
        </div>
      </PaginaAcesso>
    );
  }

  return (
    <PaginaAcesso titulo="Esqueci a senha" voltarPara="/entrar" voltarRotulo="Voltar para entrar">
      <p className="paragrafo">Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
      <Formulario aoEnviar={() => void enviar()} enviando={enviando}>
        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          autoComplete="username"
          maxLength={LIMITES.emailMax}
          erro={erroEmail}
          valor={email}
          aoMudar={setEmail}
          id="email"
        />
        {falha === 'indisponivel' ? <Faixa tipo="erro">{TEXTO_EMAIL_INDISPONIVEL}</Faixa> : null}
        {falha === 'conexao' ? <ErroEnvio /> : null}
        <Botao type="submit" bloco carregando={enviando} rotuloCarregando="Enviando…">
          Enviar link
        </Botao>
      </Formulario>
    </PaginaAcesso>
  );
}
