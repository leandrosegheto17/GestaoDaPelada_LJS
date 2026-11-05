import { email as esquemaEmail } from '@pelada/contrato/primitivos';
import { useState, type FormEvent } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import estilos from '../acesso.module.css';

/**
 * Tela Esqueci a senha (`/entrar/esqueci`, t05; ACE-22, ACE-56): pede o e-mail e envia
 * `POST /api/sessao/esqueci-senha`. O sucesso mostra a mesma mensagem exista ou não a conta
 * (`t05-esqueci--sucesso`); a falha do envio (503 `email_indisponivel`, `t05-esqueci--erro`)
 * mostra a mensagem da API na faixa de erro.
 */

export const TEXTO_ESQUECI_ENVIADO =
  'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.';
const ERRO_EMAIL = 'Informe um e-mail válido.';

export function Esqueci() {
  const api = useCliente();
  const [email, setEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setFalha(null);
    if (!esquemaEmail.safeParse(email).success) {
      setErroEmail(ERRO_EMAIL);
      return;
    }
    setErroEmail(undefined);
    setEnviando(true);
    try {
      await api.post('/api/sessao/esqueci-senha', { email });
      setEnviado(true);
    } catch (erro) {
      setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Casca titulo="Esqueci a senha" estreita>
        <Faixa tipo="info">{TEXTO_ESQUECI_ENVIADO}</Faixa>
        <LinkBotao para="/entrar" variante="secundario" bloco classe={estilos['acima-3']}>
          Voltar para entrar
        </LinkBotao>
      </Casca>
    );
  }

  return (
    <Casca estreita>
      <LinkVoltar para="/entrar">Voltar para entrar</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Esqueci a senha</h1>
      <p className={estilos.paragrafo}>Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
      <form className={estilos.formulario} noValidate aria-busy={enviando || undefined} onSubmit={enviar}>
        <Campo
          id="email"
          rotulo="E-mail"
          type="email"
          autoComplete="username"
          inputMode="email"
          erro={erroEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <Botao type="submit" bloco carregando={enviando}>
          {enviando ? 'Enviando…' : 'Enviar link'}
        </Botao>
      </form>
    </Casca>
  );
}
