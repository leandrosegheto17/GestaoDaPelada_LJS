import type { ConviteLido } from '@pelada/contrato/acesso';
import { nome as esquemaNome, senha as esquemaSenha } from '@pelada/contrato/primitivos';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CHAVE_SESSAO, useSessao } from '../../app/guarda.tsx';
import { Botao } from '../../componentes/Botao.tsx';
import { CaixaSelecao } from '../../componentes/CaixaSelecao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { lerTokenDoFragmento } from '../../dados/fragmento.ts';
import { ERRO_SENHA_CURTA, ERROS_CAMPO, ROTULOS } from '../cadastro/Cadastro.tsx';
import estilos from '../acesso.module.css';

/**
 * Tela Convite (`/convite`, t31; ACE-33 a ACE-36, ACE-56):
 * - lê o token do fragmento uma vez (T38) e chama `POST /api/convites/ler`;
 * - carregando; inválido (410, ou sem token: ACE-36);
 * - sem sessão e sem conta: cadastro com o e-mail do convite travado, que chama
 *   `POST /api/convites/cadastrar` e abre o grupo (ACE-34);
 * - com sessão no e-mail do convite: "Aceitar e abrir o grupo" chama `POST /api/convites/aceitar`
 *   e vai a `/app/grupos/:grupoId/admins` (ACE-33; destino da AD-022);
 * - com sessão em outro e-mail (ou 403 `convite_de_outro_email` no aceitar): o aviso, "Sair e
 *   entrar com outra conta" e "Voltar aos meus grupos" (ACE-35).
 *
 * [LACUNA] sem sessão, com conta já existente no e-mail do convite: o mockup não tem o estado.
 * O rascunho pede para entrar com essa conta e abrir o link do convite de novo (o token não
 * sobrevive ao login: o fragmento já foi apagado e a volta só aceita rotas de `/app`).
 */

export const TEXTO_CONVITE_INVALIDO =
  'Este convite já foi usado, foi cancelado ou passou do prazo de 7 dias. Peça um novo ao admin do grupo.';

export function destinoDoGrupo(grupoId: string): string {
  return `/app/grupos/${encodeURIComponent(grupoId)}/admins`;
}

type Leitura =
  | { tipo: 'carregando' }
  | { tipo: 'invalido' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'lido'; convite: ConviteLido };

type CampoCadastro = 'nome' | 'senha' | 'termos';

function Carregando() {
  return (
    <Casca titulo="Convite" estreita ocupada>
      <p className="sr" role="status">
        Carregando…
      </p>
      <div aria-hidden="true">
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--botao']}`} />
      </div>
    </Casca>
  );
}

function Invalido() {
  return (
    <Casca titulo="Convite inválido ou vencido" estreita>
      <Faixa tipo="atencao">{TEXTO_CONVITE_INVALIDO}</Faixa>
      <LinkBotao para="/entrar" variante="secundario" bloco classe={estilos['acima-3']}>
        Ir para entrar
      </LinkBotao>
    </Casca>
  );
}

function Convidado({ grupoNome }: { grupoNome: string }) {
  return (
    <p className={estilos.paragrafo}>
      Você foi convidado para administrar o grupo <strong>{grupoNome}</strong>.
    </p>
  );
}

export function Convite() {
  const api = useCliente();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const sessao = useSessao();
  const token = useRef<string | null | undefined>(undefined);
  const pedido = useRef<Promise<ConviteLido> | null>(null);
  const [leitura, setLeitura] = useState<Leitura>({ tipo: 'carregando' });
  const [outroEmail, setOutroEmail] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [termos, setTermos] = useState(false);
  const [erros, setErros] = useState<Partial<Record<CampoCadastro, string>>>({});

  useEffect(() => {
    if (token.current === undefined) token.current = lerTokenDoFragmento();
    const valor = token.current;
    if (valor === null) {
      setLeitura({ tipo: 'invalido' });
      return;
    }
    let ativo = true;
    pedido.current ??= api.post<ConviteLido>('/api/convites/ler', { token: valor });
    pedido.current.then(
      (convite) => {
        if (ativo) setLeitura({ tipo: 'lido', convite });
      },
      (erro: unknown) => {
        if (!ativo) return;
        if (erro instanceof ErroApi && erro.status === 410) setLeitura({ tipo: 'invalido' });
        else
          setLeitura({
            tipo: 'erro',
            mensagem: erro instanceof ErroApi ? erro.message : MENSAGEM_REDE,
          });
      },
    );
    return () => {
      ativo = false;
    };
  }, [api]);

  async function abrirGrupo(grupoId: string) {
    await consultas.invalidateQueries({ queryKey: CHAVE_SESSAO });
    void navegar(destinoDoGrupo(grupoId), { replace: true });
  }

  function tratarFalha(erro: unknown) {
    if (erro instanceof ErroApi && erro.status === 410) setLeitura({ tipo: 'invalido' });
    else if (erro instanceof ErroApi && erro.codigo === 'convite_de_outro_email')
      setOutroEmail(true);
    else setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
  }

  async function aceitar() {
    if (enviando || !token.current) return;
    setFalha(null);
    setEnviando(true);
    try {
      const r = await api.post<{ grupoId: string }>('/api/convites/aceitar', {
        token: token.current,
      });
      await abrirGrupo(r.grupoId);
    } catch (erro) {
      tratarFalha(erro);
    } finally {
      setEnviando(false);
    }
  }

  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando || !token.current) return;
    setFalha(null);
    const encontrados: Partial<Record<CampoCadastro, string>> = {};
    if (!esquemaNome.safeParse(nome).success) encontrados.nome = ERROS_CAMPO.nome;
    if (!esquemaSenha.safeParse(senha).success)
      encontrados.senha = senha.length < 8 ? ERRO_SENHA_CURTA : ERROS_CAMPO.senha;
    if (!termos) encontrados.termos = ERROS_CAMPO.termos;
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      const r = await api.post<{ grupoId: string }>('/api/convites/cadastrar', {
        token: token.current,
        nome,
        senha,
        termos: true,
      });
      await abrirGrupo(r.grupoId);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 422 && erro.campos.length > 0) {
        const daApi: Partial<Record<CampoCadastro, string>> = {};
        for (const c of erro.campos)
          if (c === 'nome' || c === 'senha' || c === 'termos') daApi[c] = ERROS_CAMPO[c];
        setErros(daApi);
      } else {
        tratarFalha(erro);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function sair() {
    setEnviando(true);
    try {
      await api.post('/api/sessao/sair');
    } catch {
      // Sair sem resposta ainda leva a entrar: a sessão vence sozinha.
    }
    consultas.clear();
    void navegar('/entrar', { replace: true });
  }

  if (leitura.tipo === 'invalido') return <Invalido />;
  if (leitura.tipo === 'erro') {
    return (
      <Casca titulo="Convite" estreita>
        <Faixa tipo="erro">{leitura.mensagem}</Faixa>
      </Casca>
    );
  }
  if (leitura.tipo === 'carregando' || sessao.isPending) return <Carregando />;

  const convite = leitura.convite;
  const ativa = sessao.data?.tipo === 'ativa' ? sessao.data.sessao : null;

  if (ativa && (outroEmail || ativa.email.toLowerCase() !== convite.email.toLowerCase())) {
    return (
      <Casca titulo="Convite" estreita>
        <Faixa tipo="atencao">
          Este convite foi enviado para outro e-mail. Você está conectado como {ativa.email}.
        </Faixa>
        <p className={`${estilos.paragrafo} ${estilos['acima-3']}`}>
          Saia e entre com a conta do e-mail convidado, ou peça um novo convite para este e-mail.
        </p>
        <Botao variante="secundario" bloco carregando={enviando} onClick={() => void sair()}>
          Sair e entrar com outra conta
        </Botao>
        <LinkBotao para="/app">Voltar aos meus grupos</LinkBotao>
      </Casca>
    );
  }

  if (ativa) {
    return (
      <Casca titulo="Convite" estreita>
        <Convidado grupoNome={convite.grupoNome} />
        <p className={estilos.paragrafo}>Você está conectado como {ativa.email}.</p>
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <div className={estilos['acima-3-soma']}>
          <Botao bloco carregando={enviando} onClick={() => void aceitar()}>
            {enviando ? 'Aceitando…' : 'Aceitar e abrir o grupo'}
          </Botao>
        </div>
        <LinkBotao para="/app">Agora não</LinkBotao>
      </Casca>
    );
  }

  if (convite.contaExiste) {
    return (
      <Casca titulo="Convite" estreita>
        <Convidado grupoNome={convite.grupoNome} />
        <p className={estilos.paragrafo}>
          Já existe uma conta com {convite.email}. Entre com ela e abra o link do convite de novo
          para aceitar.
        </p>
        <LinkBotao para="/entrar" variante="principal" bloco>
          Entrar
        </LinkBotao>
      </Casca>
    );
  }

  const resumo = (['nome', 'senha', 'termos'] as const)
    .filter((c) => erros[c])
    .map((c) => ({ id: c, rotulo: ROTULOS[c] }));

  return (
    <Casca titulo="Convite" estreita>
      <Convidado grupoNome={convite.grupoNome} />
      <p className={estilos.paragrafo}>
        Crie sua conta para aceitar. O e-mail já está confirmado pelo convite.
      </p>
      <form
        className={estilos.formulario}
        noValidate
        aria-busy={enviando || undefined}
        onSubmit={cadastrar}
      >
        <ResumoErros erros={resumo} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <Campo
          id="nome"
          rotulo={ROTULOS.nome}
          autoComplete="name"
          erro={erros.nome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          id="email"
          rotulo="E-mail"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={convite.email}
          somenteLeitura
          onChange={() => undefined}
          ajuda="O convite foi enviado para este e-mail."
        />
        <Campo
          id="senha"
          rotulo={ROTULOS.senha}
          type="password"
          autoComplete="new-password"
          ajuda="De 8 a 72 caracteres."
          erro={erros.senha}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <CaixaSelecao
          id="termos"
          checked={termos}
          erro={erros.termos}
          onChange={(e) => setTermos(e.target.checked)}
        >
          Li e aceito os <Link to="/termos">termos de uso</Link> e a{' '}
          <Link to="/privacidade">política de privacidade</Link>
        </CaixaSelecao>
        <Botao type="submit" bloco carregando={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta e aceitar'}
        </Botao>
      </form>
      <p className={`${estilos.paragrafo} ${estilos['acima-4']}`}>
        Já tem conta com este e-mail? <Link to="/entrar">Entrar</Link>
      </p>
    </Casca>
  );
}
