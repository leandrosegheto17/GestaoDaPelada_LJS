import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { destinoAposEntrar } from '../../app/guarda/decidir-rota';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CampoSenha } from '../../componentes/campos/CampoSenha';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { chaveSessao, lerSessao } from '../../dados/sessao';
import { ehEmailIndisponivel, TEXTO_EMAIL_INDISPONIVEL } from '../compartilhado/falhas';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';

const TEXTO_CREDENCIAIS = 'E-mail ou senha incorretos.';
const TEXTO_BLOQUEADO = 'Muitas tentativas. Tente de novo em 15 minutos.';
const TEXTO_NAO_CONFIRMADO = 'Confirme seu e-mail para entrar. Enviamos o link quando você criou a conta.';
const TEXTO_REENVIADO = 'Se houver uma conta com esse e-mail, enviamos um novo link de confirmação.';

type Falha = 'credenciais' | 'bloqueado' | 'nao-confirmado' | 'conexao';

function falhaDeEntrar(erro: unknown): Falha {
  if (erro instanceof ErroApi) {
    if (erro.status === 429) return 'bloqueado';
    if (erro.status === 403 && erro.codigo === 'email_nao_confirmado') return 'nao-confirmado';
    if (erro.status === 401 || erro.status === 422) return 'credenciais';
  }
  return 'conexao';
}

/** Avisos que outras telas deixam na URL (`?aviso=`): sessão expirada (ACE-20) e senha trocada (ACE-24). */
function AvisoDaUrl({ aviso }: { aviso: string | null }) {
  if (aviso === 'sessao-expirada') return <Faixa tipo="info">Sua sessão expirou. Entre de novo.</Faixa>;
  if (aviso === 'senha-alterada') return <Faixa tipo="sucesso">Senha alterada. Entre com a nova senha.</Faixa>;
  return null;
}

/** T04: entrar com e-mail e senha (ACE-11 a ACE-13, ACE-20). */
export function Entrar() {
  const [parametros] = useSearchParams();
  const navegar = useNavigate();
  const cliente = useQueryClient();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [reenvio, setReenvio] = useState<'enviado' | 'indisponivel' | 'conexao' | null>(null);

  const entrar = async () => {
    setFalha(null);
    setReenvio(null);
    setEnviando(true);
    try {
      await escrever('POST', '/sessao/entrar', { email, senha }, semCorpo);
      await cliente.fetchQuery({ queryKey: chaveSessao, queryFn: lerSessao, staleTime: 0 });
      void navegar(destinoAposEntrar(parametros.get('volta')), { replace: true });
    } catch (erro) {
      setFalha(falhaDeEntrar(erro));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    setReenvio(null);
    setReenviando(true);
    try {
      await escrever('POST', '/conta/reenviar-confirmacao', { email }, semCorpo);
      setReenvio('enviado');
    } catch (erro) {
      setReenvio(ehEmailIndisponivel(erro) ? 'indisponivel' : 'conexao');
    } finally {
      setReenviando(false);
    }
  };

  return (
    <PaginaAcesso titulo="Entrar" voltarPara="/" voltarRotulo="Voltar ao ranking">
      <AvisoDaUrl aviso={parametros.get('aviso')} />
      <Formulario aoEnviar={() => void entrar()} enviando={enviando}>
        <CampoTexto rotulo="E-mail" tipo="email" autoComplete="username" valor={email} aoMudar={setEmail} id="email" />
        <CampoSenha rotulo="Senha" autoComplete="current-password" valor={senha} aoMudar={setSenha} id="senha" />
        <p className="ajuda">No iPhone, o app instalado e o Safari pedem login separadamente.</p>
        {falha === 'credenciais' ? <Faixa tipo="erro">{TEXTO_CREDENCIAIS}</Faixa> : null}
        {falha === 'bloqueado' ? <Faixa tipo="erro">{TEXTO_BLOQUEADO}</Faixa> : null}
        {falha === 'conexao' ? <ErroEnvio /> : null}
        {falha === 'nao-confirmado' ? (
          <>
            <Faixa tipo="atencao" papel="alert">
              {TEXTO_NAO_CONFIRMADO}
            </Faixa>
            <Botao
              variante="secundario"
              bloco
              carregando={reenviando}
              rotuloCarregando="Enviando…"
              onClick={() => void reenviar()}
            >
              Enviar outro link
            </Botao>
            {reenvio === 'enviado' ? <Faixa tipo="info">{TEXTO_REENVIADO}</Faixa> : null}
            {reenvio === 'indisponivel' ? <Faixa tipo="erro">{TEXTO_EMAIL_INDISPONIVEL}</Faixa> : null}
            {reenvio === 'conexao' ? <ErroEnvio /> : null}
          </>
        ) : null}
        <Botao type="submit" variante="principal" bloco carregando={enviando} rotuloCarregando="Entrando…">
          Entrar
        </Botao>
        <BotaoLink to="/entrar/esqueci" variante="texto">
          Esqueci a senha
        </BotaoLink>
      </Formulario>
      <p className="paragrafo acima-4">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </PaginaAcesso>
  );
}
