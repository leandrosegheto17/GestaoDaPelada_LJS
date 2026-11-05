import { senha as esquemaSenha } from '@pelada/contrato/primitivos';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { lerTokenDoFragmento } from '../../dados/fragmento.ts';
import estilos from '../acesso.module.css';

/**
 * Tela Nova senha (`/entrar/nova-senha`, t06; ACE-24, ACE-25, ACE-56):
 * - lê o token do fragmento uma vez (T38; num ref, por causa do efeito duplo do StrictMode);
 * - nova senha e confirmação, validadas antes de enviar (`t06-nova-senha--erro`: "As senhas
 *   não conferem.", com o `ResumoErros`);
 * - `POST /api/sessao/nova-senha` com o token e a senha; 200 vai a
 *   `/entrar?aviso=senha-alterada` ("Senha alterada. Entre com a nova senha.", ACE-24);
 * - 410, ou sem token, ou token malformado: "Link inválido ou vencido" com "Pedir novo link"
 *   (`t06-nova-senha--invalido`, ACE-25).
 */

export const DESTINO_SENHA_ALTERADA = '/entrar?aviso=senha-alterada';
export const TEXTO_LINK_VENCIDO = 'Este link já foi usado ou passou do prazo de 1 hora.';
export const ERRO_SENHAS_DIFERENTES = 'As senhas não conferem.';
export const ERRO_SENHA = 'A senha precisa ter de 8 a 72 caracteres.';

type CampoSenha = 'nova' | 'conf';
const ROTULOS: Readonly<Record<CampoSenha, string>> = {
  nova: 'Nova senha',
  conf: 'Confirmar nova senha',
};

export function NovaSenha() {
  const api = useCliente();
  const navegar = useNavigate();
  const lido = useRef<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [invalido, setInvalido] = useState(false);
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [erros, setErros] = useState<Partial<Record<CampoSenha, string>>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (lido.current === undefined) lido.current = lerTokenDoFragmento();
    setToken(lido.current);
  }, []);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando || !token) return;
    setFalha(null);
    const encontrados: Partial<Record<CampoSenha, string>> = {};
    if (!esquemaSenha.safeParse(nova).success) encontrados.nova = ERRO_SENHA;
    if (conf !== nova) encontrados.conf = ERRO_SENHAS_DIFERENTES;
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      await api.post('/api/sessao/nova-senha', { token, senha: nova });
      void navegar(DESTINO_SENHA_ALTERADA, { replace: true });
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 410) setInvalido(true);
      else if (erro instanceof ErroApi && erro.campos.includes('senha'))
        setErros({ nova: ERRO_SENHA });
      else setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setEnviando(false);
    }
  }

  // Lendo o fragmento (primeiro render): nada a mostrar ainda.
  if (token === undefined) return <Casca titulo="Crie uma nova senha" estreita ocupada />;

  if (token === null || invalido) {
    return (
      <Casca titulo="Link inválido ou vencido" estreita>
        <Faixa tipo="atencao">{TEXTO_LINK_VENCIDO}</Faixa>
        <LinkBotao para="/entrar/esqueci" variante="principal" bloco classe={estilos['acima-3']}>
          Pedir novo link
        </LinkBotao>
        <LinkBotao para="/entrar">Voltar para entrar</LinkBotao>
      </Casca>
    );
  }

  const resumo = (['nova', 'conf'] as const)
    .filter((c) => erros[c])
    .map((c) => ({ id: c, rotulo: ROTULOS[c] }));

  return (
    <Casca titulo="Crie uma nova senha" estreita>
      <p className={estilos.paragrafo}>
        Depois de salvar, todos os aparelhos conectados à sua conta saem e você entra de novo com a
        senha nova.
      </p>
      <form
        className={estilos.formulario}
        noValidate
        aria-busy={enviando || undefined}
        onSubmit={salvar}
      >
        <ResumoErros erros={resumo} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <Campo
          id="nova"
          rotulo={ROTULOS.nova}
          type="password"
          autoComplete="new-password"
          ajuda="De 8 a 72 caracteres."
          erro={erros.nova}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
        <Campo
          id="conf"
          rotulo={ROTULOS.conf}
          type="password"
          autoComplete="new-password"
          erro={erros.conf}
          value={conf}
          onChange={(e) => setConf(e.target.value)}
        />
        <Botao type="submit" bloco carregando={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </Botao>
      </form>
    </Casca>
  );
}
