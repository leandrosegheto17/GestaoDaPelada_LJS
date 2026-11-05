import { email as esquemaEmail } from '@pelada/contrato/primitivos';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { lerTokenDoFragmento } from '../../dados/fragmento.ts';
import { TEXTO_REENVIADO } from '../entrar/Entrar.tsx';
import estilos from '../acesso.module.css';

/**
 * Tela Confirmar e-mail (`/confirmar`, t30; ACE-06, ACE-07, ACE-08, ACE-56):
 * - lê o token do fragmento uma vez (`#t=`, T38) e envia `POST /api/conta/confirmar`;
 * - 200: vai a `/entrar?aviso=email-confirmado` ("E-mail confirmado. Entre com a sua senha.",
 *   ACE-06), sem sessão nova; o comentário do mockup diz `/app`, mas vale a spec;
 * - 410 (ou sem token, ou token malformado): "Link inválido ou vencido", com o pedido de novo
 *   link (`POST /api/conta/reenviar-confirmacao`), que mostra o estado reenviado com a mesma
 *   mensagem exista ou não a conta (ACE-07, ACE-08).
 *
 * O pedido fica num ref: no StrictMode o efeito roda duas vezes, e um segundo POST com o mesmo
 * token responderia 410 (o link já foi usado).
 *
 * SPEC_DEVIATION: a tarefa cita `TelaMensagem`, mas o mockup de t30 usa título, faixa e
 * formulário na coluna estreita; vale o mockup.
 */

export const DESTINO_CONFIRMADO = '/entrar?aviso=email-confirmado';
export const TEXTO_LINK_INVALIDO = 'Este link já foi usado ou passou do prazo de 24 horas.';
const ERRO_EMAIL = 'Informe um e-mail válido.';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'invalido' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'reenviado' };

export function Confirmar() {
  const api = useCliente();
  const navegar = useNavigate();
  const token = useRef<string | null | undefined>(undefined);
  const pedido = useRef<Promise<unknown> | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [email, setEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | undefined>();
  const [falhaReenvio, setFalhaReenvio] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    if (token.current === undefined) token.current = lerTokenDoFragmento();
    const valor = token.current;
    if (valor === null) {
      setEstado({ tipo: 'invalido' });
      return;
    }
    let ativo = true;
    pedido.current ??= api.post('/api/conta/confirmar', { token: valor });
    pedido.current.then(
      () => {
        if (ativo) void navegar(DESTINO_CONFIRMADO, { replace: true });
      },
      (erro: unknown) => {
        if (!ativo) return;
        if (erro instanceof ErroApi && (erro.status === 410 || erro.status === 422)) setEstado({ tipo: 'invalido' });
        else setEstado({ tipo: 'erro', mensagem: erro instanceof ErroApi ? erro.message : MENSAGEM_REDE });
      },
    );
    return () => {
      ativo = false;
    };
  }, [api, navegar, tentativa]);

  function tentarDeNovo() {
    pedido.current = null;
    setEstado({ tipo: 'carregando' });
    setTentativa((n) => n + 1);
  }

  async function reenviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (reenviando) return;
    setFalhaReenvio(null);
    if (!esquemaEmail.safeParse(email).success) {
      setErroEmail(ERRO_EMAIL);
      return;
    }
    setErroEmail(undefined);
    setReenviando(true);
    try {
      await api.post('/api/conta/reenviar-confirmacao', { email });
      setEstado({ tipo: 'reenviado' });
    } catch (erro) {
      setFalhaReenvio(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setReenviando(false);
    }
  }

  if (estado.tipo === 'carregando') {
    return (
      <Casca titulo="Confirmando seu e-mail" estreita ocupada>
        <p className="sr" role="status">
          Confirmando…
        </p>
        <div aria-hidden="true">
          <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
          <span className={`${estilos.esqueleto} ${estilos['esqueleto--botao']}`} />
        </div>
      </Casca>
    );
  }

  if (estado.tipo === 'erro') {
    return (
      <Casca titulo="Confirmando seu e-mail" estreita>
        <Faixa tipo="erro" acao={<Botao variante="texto" onClick={tentarDeNovo}>Tentar de novo</Botao>}>
          {estado.mensagem}
        </Faixa>
      </Casca>
    );
  }

  if (estado.tipo === 'reenviado') {
    return (
      <Casca titulo="Verifique seu e-mail" estreita>
        <Faixa tipo="info">{TEXTO_REENVIADO}</Faixa>
        <LinkBotao para="/entrar" variante="secundario" bloco classe={estilos['acima-3']}>
          Voltar para entrar
        </LinkBotao>
      </Casca>
    );
  }

  return (
    <Casca titulo="Link inválido ou vencido" estreita>
      <Faixa tipo="atencao">{TEXTO_LINK_INVALIDO}</Faixa>
      <form className={`${estilos.formulario} ${estilos['acima-3']}`} noValidate aria-busy={reenviando || undefined} onSubmit={reenviar}>
        {falhaReenvio ? <Faixa tipo="erro">{falhaReenvio}</Faixa> : null}
        <Campo
          id="email"
          rotulo="E-mail da conta"
          type="email"
          autoComplete="username"
          inputMode="email"
          erro={erroEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Botao type="submit" bloco carregando={reenviando}>
          {reenviando ? 'Enviando…' : 'Enviar novo link'}
        </Botao>
      </form>
      <LinkBotao para="/entrar">Voltar para entrar</LinkBotao>
    </Casca>
  );
}
