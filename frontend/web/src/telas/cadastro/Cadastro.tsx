import { email as esquemaEmail, nome as esquemaNome, senha as esquemaSenha } from '@pelada/contrato/primitivos';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { CaixaSelecao } from '../../componentes/CaixaSelecao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import estilos from '../acesso.module.css';

/**
 * Tela Cadastro (`/cadastro`, t29; ACE-01, ACE-03, ACE-56, ACE-59):
 * - nome, e-mail, senha e o aceite (desmarcado, com links para `/termos` e `/privacidade`);
 * - a validação acontece antes de enviar, com os primitivos do contrato (os mesmos limites da
 *   API); o 422 da API (`campos`) marca os mesmos campos (ACE-03);
 * - erros por campo e o `ResumoErros` ("Corrija N campos:"), como em `t29-cadastro--erro`;
 * - 201: a tela "Verifique seu e-mail" (`t29-cadastro--sucesso`), igual para e-mail novo ou já
 *   cadastrado (ACE-01, ACE-04).
 */

type CampoCadastro = 'nome' | 'email' | 'senha' | 'termos';

export const ROTULOS: Readonly<Record<CampoCadastro, string>> = {
  nome: 'Seu nome',
  email: 'E-mail',
  senha: 'Senha',
  termos: 'Aceite dos termos',
};

/** Mensagens por campo; `email`, `senha` e `termos` são as do mockup (`t29-cadastro--erro`). */
export const ERROS_CAMPO: Readonly<Record<CampoCadastro, string>> = {
  // PREMISSA: o mockup não mostra o erro do nome; texto no mesmo tom dos outros.
  nome: 'Informe seu nome, de 2 a 60 caracteres.',
  email: 'Informe um e-mail válido.',
  senha: 'A senha precisa ter de 8 a 72 caracteres.',
  termos: 'Aceite os termos para criar a conta.',
};

export const ERRO_SENHA_CURTA = 'A senha precisa ter pelo menos 8 caracteres.';
export const TEXTO_ENVIADO = 'Enviamos um link de confirmação para o seu e-mail. Ele vale por 24 horas.';

const ORDEM: readonly CampoCadastro[] = ['nome', 'email', 'senha', 'termos'];

type Erros = Partial<Record<CampoCadastro, string>>;

interface Dados {
  nome: string;
  email: string;
  senha: string;
  termos: boolean;
}

function validar(d: Dados): Erros {
  const erros: Erros = {};
  if (!esquemaNome.safeParse(d.nome).success) erros.nome = ERROS_CAMPO.nome;
  if (!esquemaEmail.safeParse(d.email).success) erros.email = ERROS_CAMPO.email;
  if (!esquemaSenha.safeParse(d.senha).success) erros.senha = d.senha.length < 8 ? ERRO_SENHA_CURTA : ERROS_CAMPO.senha;
  if (!d.termos) erros.termos = ERROS_CAMPO.termos;
  return erros;
}

function errosDaApi(erro: ErroApi): Erros {
  const erros: Erros = {};
  for (const c of erro.campos) if ((ORDEM as readonly string[]).includes(c)) erros[c as CampoCadastro] = ERROS_CAMPO[c as CampoCadastro];
  if (erro.codigo === 'termos_obrigatorios') erros.termos = ERROS_CAMPO.termos;
  return erros;
}

function IconeVoltar() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function Cadastro() {
  const api = useCliente();
  const [dados, setDados] = useState<Dados>({ nome: '', email: '', senha: '', termos: false });
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const mudar = <K extends keyof Dados>(campo: K, valor: Dados[K]) => setDados((d) => ({ ...d, [campo]: valor }));

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setFalha(null);
    const encontrados = validar(dados);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      await api.post('/api/conta', { nome: dados.nome, email: dados.email, senha: dados.senha, termos: true });
      setEnviado(true);
    } catch (erro) {
      const daApi = erro instanceof ErroApi ? errosDaApi(erro) : {};
      if (Object.keys(daApi).length > 0) setErros(daApi);
      else setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Casca titulo="Verifique seu e-mail" estreita>
        <Faixa tipo="info">{TEXTO_ENVIADO}</Faixa>
        <p className={`${estilos.paragrafo} ${estilos['acima-3']}`}>Não chegou? Confira a caixa de spam ou peça outro link.</p>
        <LinkBotao para="/confirmar" variante="secundario" bloco>
          Enviar outro link
        </LinkBotao>
        <LinkBotao para="/entrar">Voltar para entrar</LinkBotao>
      </Casca>
    );
  }

  const resumo = ORDEM.filter((c) => erros[c]).map((c) => ({ id: c, rotulo: ROTULOS[c] }));

  return (
    <Casca estreita>
      <Link className={estilos.voltar} to="/entrar">
        <IconeVoltar />
        Voltar para entrar
      </Link>
      <h1 className={estilos['titulo-pagina']}>Criar conta</h1>
      <p className={estilos.paragrafo}>Organize presença, times e ranking da sua pelada. Grátis para começar.</p>
      <form className={estilos.formulario} noValidate aria-busy={enviando || undefined} onSubmit={criar}>
        <ResumoErros erros={resumo} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <Campo
          id="nome"
          rotulo={ROTULOS.nome}
          autoComplete="name"
          ajuda="Como os outros admins vão ver você."
          erro={erros.nome}
          value={dados.nome}
          onChange={(e) => mudar('nome', e.target.value)}
        />
        <Campo
          id="email"
          rotulo={ROTULOS.email}
          type="email"
          autoComplete="username"
          inputMode="email"
          erro={erros.email}
          value={dados.email}
          onChange={(e) => mudar('email', e.target.value)}
        />
        <Campo
          id="senha"
          rotulo={ROTULOS.senha}
          type="password"
          autoComplete="new-password"
          ajuda="De 8 a 72 caracteres."
          erro={erros.senha}
          value={dados.senha}
          onChange={(e) => mudar('senha', e.target.value)}
        />
        <CaixaSelecao id="termos" checked={dados.termos} erro={erros.termos} onChange={(e) => mudar('termos', e.target.checked)}>
          Li e aceito os <Link to="/termos">termos de uso</Link> e a <Link to="/privacidade">política de privacidade</Link>
        </CaixaSelecao>
        <Botao type="submit" bloco carregando={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta'}
        </Botao>
        <LinkBotao para="/entrar">Já tenho conta</LinkBotao>
      </form>
    </Casca>
  );
}
