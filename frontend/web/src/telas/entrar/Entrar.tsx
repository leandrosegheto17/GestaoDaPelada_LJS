import type { EntrarResposta } from '@pelada/contrato/acesso';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CHAVE_SESSAO } from '../../app/guarda.tsx';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo, CampoSenha } from '../../componentes/Campo.tsx';
import estilosCampo from '../../componentes/Campo.module.css';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa, type TipoFaixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import estilos from '../acesso.module.css';

/**
 * Tela Entrar (`/entrar`, t04; ACE-09, ACE-11, ACE-12, ACE-13, ACE-20, ACE-06, ACE-24, ACE-56):
 * - envia `POST /api/sessao/entrar`; no 200, invalida a consulta da sessão e a `GuardaPublica`
 *   leva ao destino pedido (ACE-19, ACE-65);
 * - 401 e 429 mostram a mensagem da API na faixa de erro (`t04-entrar--erro`, `--bloqueado`);
 * - 403 `email_nao_confirmado` mostra a faixa de atenção com "Enviar outro link", que chama
 *   `POST /api/conta/reenviar-confirmacao` (`t04-entrar--nao-confirmado`, ACE-12);
 * - `?aviso=` mostra a faixa do aviso (sessão expirada, e-mail confirmado, senha alterada).
 *
 * SPEC_DEVIATION: o mockup tem o link "Voltar ao ranking", que depende do ranking público
 * (feature `partidas-e-ranking`); ele fica de fora até lá.
 */

export const AVISOS_ENTRAR: Readonly<Record<string, { tipo: TipoFaixa; texto: string }>> = {
  'sessao-expirada': { tipo: 'info', texto: 'Sua sessão expirou. Entre de novo.' },
  'email-confirmado': { tipo: 'sucesso', texto: 'E-mail confirmado. Entre com a sua senha.' },
  'senha-alterada': { tipo: 'sucesso', texto: 'Senha alterada. Entre com a nova senha.' },
};

export const TEXTO_NAO_CONFIRMADO = 'Confirme seu e-mail para entrar. Enviamos o link quando você criou a conta.';
export const TEXTO_REENVIADO = 'Se houver uma conta com esse e-mail, enviamos um novo link de confirmação.';
export const AJUDA_IPHONE = 'No iPhone, o app instalado e o Safari pedem login separadamente.';

type Estado =
  | { tipo: 'ocioso' }
  | { tipo: 'enviando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'nao-confirmado'; reenvio: 'ocioso' | 'enviando' | 'enviado' | { erro: string } };

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : MENSAGEM_REDE;
}

export function Entrar() {
  const api = useCliente();
  const consultas = useQueryClient();
  const [parametros] = useSearchParams();
  const aviso = AVISOS_ENTRAR[parametros.get('aviso') ?? ''];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' });
  const enviando = estado.tipo === 'enviando';

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEstado({ tipo: 'enviando' });
    try {
      await api.post<EntrarResposta>('/api/sessao/entrar', { email, senha });
      await consultas.invalidateQueries({ queryKey: CHAVE_SESSAO });
    } catch (erro) {
      setSenha('');
      if (erro instanceof ErroApi && erro.codigo === 'email_nao_confirmado') {
        setEstado({ tipo: 'nao-confirmado', reenvio: 'ocioso' });
      } else {
        setEstado({ tipo: 'erro', mensagem: mensagemDe(erro) });
      }
    }
  }

  async function reenviar() {
    setEstado({ tipo: 'nao-confirmado', reenvio: 'enviando' });
    try {
      await api.post('/api/conta/reenviar-confirmacao', { email });
      setEstado({ tipo: 'nao-confirmado', reenvio: 'enviado' });
    } catch (erro) {
      setEstado({ tipo: 'nao-confirmado', reenvio: { erro: mensagemDe(erro) } });
    }
  }

  return (
    <Casca titulo="Entrar" estreita>
      {aviso ? <Faixa tipo={aviso.tipo}>{aviso.texto}</Faixa> : null}
      <form className={estilos.formulario} noValidate aria-busy={enviando || undefined} onSubmit={entrar}>
        <Campo
          id="email"
          rotulo="E-mail"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <CampoSenha id="senha" rotulo="Senha" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <p className={estilosCampo['campo__ajuda']}>{AJUDA_IPHONE}</p>
        {estado.tipo === 'erro' ? <Faixa tipo="erro">{estado.mensagem}</Faixa> : null}
        {estado.tipo === 'nao-confirmado' ? (
          <>
            {estado.reenvio === 'enviado' ? (
              <Faixa tipo="info">{TEXTO_REENVIADO}</Faixa>
            ) : (
              <Faixa tipo="atencao">{TEXTO_NAO_CONFIRMADO}</Faixa>
            )}
            {typeof estado.reenvio === 'object' ? <Faixa tipo="erro">{estado.reenvio.erro}</Faixa> : null}
            {estado.reenvio !== 'enviado' ? (
              <Botao variante="secundario" bloco carregando={estado.reenvio === 'enviando'} onClick={() => void reenviar()}>
                {estado.reenvio === 'enviando' ? 'Enviando…' : 'Enviar outro link'}
              </Botao>
            ) : null}
          </>
        ) : null}
        <Botao type="submit" bloco carregando={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
        <LinkBotao para="/entrar/esqueci">Esqueci a senha</LinkBotao>
      </form>
      <p className={`${estilos.paragrafo} ${estilos['acima-4']}`}>
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </Casca>
  );
}
