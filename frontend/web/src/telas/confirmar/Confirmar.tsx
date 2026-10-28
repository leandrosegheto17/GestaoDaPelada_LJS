import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { ehEmailIndisponivel, TEXTO_EMAIL_INDISPONIVEL } from '../compartilhado/falhas';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';
import { usarTokenDoLink } from '../compartilhado/usarTokenDoLink';

type Etapa = 'confirmando' | 'invalido' | 'conexao' | 'reenviado';

/** Link vencido, já usado ou malformado: a API responde 410 (ACE-07) ou 422 (token fora do formato). */
function ehLinkInvalido(erro: unknown): boolean {
  return erro instanceof ErroApi && (erro.status === 410 || erro.status === 422);
}

/** T30: confirma o e-mail pelo token do link (`#t=`) e leva a `/entrar` com o aviso, sem abrir sessão (ACE-06 a ACE-08). */
export function Confirmar() {
  const { pronto, token } = usarTokenDoLink();
  const navegar = useNavigate();
  const iniciou = useRef(false);

  const [etapa, setEtapa] = useState<Etapa>('confirmando');
  const [email, setEmail] = useState('');
  const [reenviando, setReenviando] = useState(false);
  const [falhaReenvio, setFalhaReenvio] = useState<'indisponivel' | 'conexao' | null>(null);

  const confirmar = async (valor: string) => {
    setEtapa('confirmando');
    try {
      await escrever('POST', '/conta/confirmar', { token: valor }, semCorpo);
      void navegar('/entrar?aviso=email-confirmado', { replace: true });
    } catch (erro) {
      setEtapa(ehLinkInvalido(erro) ? 'invalido' : 'conexao');
    }
  };

  useEffect(() => {
    if (!pronto || iniciou.current) return;
    iniciou.current = true;
    if (token === null) setEtapa('invalido');
    else void confirmar(token);
    // `confirmar` só usa estado estável e é chamado uma única vez (guarda `iniciou`).
  }, [pronto, token]);

  const reenviar = async () => {
    setFalhaReenvio(null);
    setReenviando(true);
    try {
      await escrever('POST', '/conta/reenviar-confirmacao', { email }, semCorpo);
      setEtapa('reenviado');
    } catch (erro) {
      setFalhaReenvio(ehEmailIndisponivel(erro) ? 'indisponivel' : 'conexao');
    } finally {
      setReenviando(false);
    }
  };

  if (etapa === 'reenviado') {
    return (
      <PaginaAcesso titulo="Verifique seu e-mail">
        <Faixa tipo="info">Se houver uma conta com esse e-mail, enviamos um novo link de confirmação.</Faixa>
        <div className="recuo-3">
          <BotaoLink to="/entrar" variante="secundario" bloco>
            Voltar para entrar
          </BotaoLink>
        </div>
      </PaginaAcesso>
    );
  }

  if (etapa === 'invalido') {
    return (
      <PaginaAcesso titulo="Link inválido ou vencido">
        <Faixa tipo="atencao">Este link já foi usado ou passou do prazo de 24 horas.</Faixa>
        <Formulario aoEnviar={() => void reenviar()} enviando={reenviando} classe="acima-3">
          <CampoTexto
            rotulo="E-mail da conta"
            tipo="email"
            autoComplete="username"
            valor={email}
            aoMudar={setEmail}
            id="email"
          />
          {falhaReenvio === 'indisponivel' ? <Faixa tipo="erro">{TEXTO_EMAIL_INDISPONIVEL}</Faixa> : null}
          {falhaReenvio === 'conexao' ? <ErroEnvio /> : null}
          <Botao type="submit" bloco carregando={reenviando} rotuloCarregando="Enviando…">
            Enviar novo link
          </Botao>
        </Formulario>
        <BotaoLink to="/entrar" variante="texto">
          Voltar para entrar
        </BotaoLink>
      </PaginaAcesso>
    );
  }

  return (
    <PaginaAcesso titulo="Confirmando seu e-mail" ocupado={etapa === 'confirmando'}>
      {etapa === 'conexao' ? (
        <ErroRede aoTentar={() => token && void confirmar(token)} />
      ) : (
        <>
          <p className="sr" role="status">
            Confirmando…
          </p>
          <FormaEsqueleto variante="linha" />
          <FormaEsqueleto variante="botao" />
        </>
      )}
    </PaginaAcesso>
  );
}
