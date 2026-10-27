import { conviteCadastroCorpo, LIMITES } from '@pelada/contrato';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Icone } from '../../componentes/basicos/Icone';
import { CampoSenha } from '../../componentes/campos/CampoSenha';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { ResumoErros, type ErroDeCampo } from '../../componentes/campos/ResumoErros';
import { CaixaSelecao } from '../../componentes/escolhas/CaixaSelecao';
import { escrever, type Esquema } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { chaveSessao, lerSessao, useSair } from '../../dados/sessao';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';
import { usarTokenDoLink } from '../compartilhado/usarTokenDoLink';
import estilos from './Convite.module.css';

const TEXTO_ACEITE = 'Aceite os termos para criar a conta.';
const TEXTO_CONTA_EXISTENTE = 'Este e-mail já tem conta. Entre para aceitar o convite.';

interface ConviteLido {
  email: string;
  grupoNome: string;
  contaExiste: boolean;
}

interface Aceite {
  grupoId: string;
}

/** Forma de `POST /api/convites/ler`; conferida na mão para não puxar schema novo só para a tela. */
const conviteLido: Esquema<ConviteLido> = {
  safeParse(dado) {
    const d = dado as Partial<ConviteLido> | null;
    if (typeof d?.email === 'string' && typeof d.grupoNome === 'string' && typeof d.contaExiste === 'boolean') {
      return { success: true, data: { email: d.email, grupoNome: d.grupoNome, contaExiste: d.contaExiste } };
    }
    return { success: false };
  },
};

/** Forma de `POST /api/convites/aceitar` e `/cadastrar`: `{ grupoId }`. */
const aceite: Esquema<Aceite> = {
  safeParse(dado) {
    const d = dado as Partial<Aceite> | null;
    return typeof d?.grupoId === 'string' && d.grupoId !== ''
      ? { success: true, data: { grupoId: d.grupoId } }
      : { success: false };
  },
};

/** Link vencido, usado, cancelado ou malformado: 410 (ACE-36) ou 422 (token fora do formato). */
function ehLinkInvalido(erro: unknown): boolean {
  return erro instanceof ErroApi && (erro.status === 410 || erro.status === 422);
}

/** Depois de aceitar o convite: a sessão passa a ter o vínculo novo e a tela abre o grupo (ACE-33). */
function useAbrirGrupo() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  return async (grupoId: string) => {
    await cliente.fetchQuery({ queryKey: chaveSessao, queryFn: lerSessao, staleTime: 0 }).catch(() => undefined);
    void navegar(`/app/grupos/${grupoId}/admins`, { replace: true });
  };
}

function Apresentacao({ grupoNome }: { grupoNome: string }) {
  return (
    <p className="paragrafo">
      Você foi convidado para administrar o grupo <strong>{grupoNome}</strong>.
    </p>
  );
}

interface PropsAceitar {
  token: string;
  convite: ConviteLido;
  emailDaConta: string;
  aoInvalido: () => void;
  aoOutroEmail: () => void;
}

/** Logada com o e-mail do convite: aceitar cria o vínculo (ACE-33). */
function AceitarConvite({ token, convite, emailDaConta, aoInvalido, aoOutroEmail }: PropsAceitar) {
  const abrirGrupo = useAbrirGrupo();
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const aceitar = async () => {
    setFalhou(false);
    setEnviando(true);
    try {
      const resultado = await escrever('POST', '/convites/aceitar', { token }, aceite);
      await abrirGrupo(resultado.grupoId);
    } catch (erro) {
      setEnviando(false);
      if (ehLinkInvalido(erro)) aoInvalido();
      else if (erro instanceof ErroApi && erro.status === 403 && erro.codigo === 'convite_de_outro_email') {
        aoOutroEmail();
      } else setFalhou(true);
    }
  };

  return (
    <>
      <Apresentacao grupoNome={convite.grupoNome} />
      <p className="paragrafo">Você está conectado como {emailDaConta}.</p>
      {falhou ? <ErroEnvio /> : null}
      <div className="recuo-3">
        <Botao bloco carregando={enviando} rotuloCarregando="Aceitando…" onClick={() => void aceitar()}>
          Aceitar e abrir o grupo
        </Botao>
      </div>
      <BotaoLink to="/app" variante="texto">
        Agora não
      </BotaoLink>
    </>
  );
}

/** Logada com outra conta (ACE-35): nada é criado; a pessoa sai ou volta aos grupos dela. */
function OutroEmail({ emailDaConta }: { emailDaConta: string }) {
  const sair = useSair();
  const navegar = useNavigate();
  const aoSair = () => sair.mutate(undefined, { onSuccess: () => void navegar('/entrar', { replace: true }) });
  return (
    <>
      <Faixa tipo="atencao" papel="alert">
        Este convite foi enviado para outro e-mail. Você está conectado como {emailDaConta}.
      </Faixa>
      <p className="paragrafo acima-3">
        Saia e entre com a conta do e-mail convidado, ou peça um novo convite para este e-mail.
      </p>
      <Botao variante="secundario" bloco carregando={sair.isPending} onClick={aoSair}>
        Sair e entrar com outra conta
      </Botao>
      {sair.isError ? <ErroEnvio /> : null}
      <BotaoLink to="/app" variante="texto">
        Voltar aos meus grupos
      </BotaoLink>
    </>
  );
}

type Campo = 'nome' | 'senha' | 'termos';
type Erros = Partial<Record<Campo, string>>;
const ROTULO: Record<Campo, string> = { nome: 'Seu nome', senha: 'Senha', termos: 'Aceite dos termos' };
const ORDEM: Campo[] = ['nome', 'senha', 'termos'];

function ehCampo(chave: string): chave is Campo {
  return ORDEM.includes(chave as Campo);
}

interface PropsCadastro {
  token: string;
  convite: ConviteLido;
  aoInvalido: () => void;
}

/** Sem conta: cadastro com o e-mail do convite travado; a conta nasce confirmada e com o vínculo (ACE-34). */
function CadastroPeloConvite({ token, convite, aoInvalido }: PropsCadastro) {
  const abrirGrupo = useAbrirGrupo();
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<'conta-existente' | 'conexao' | null>(null);

  const enviar = async () => {
    setFalha(null);
    const analise = conviteCadastroCorpo.safeParse({ token, nome, senha, termos: aceitou });
    const encontrados: Erros = {};
    if (!analise.success) {
      for (const problema of analise.error.issues) {
        const campo = String(problema.path[0]);
        if (ehCampo(campo) && encontrados[campo] === undefined) {
          encontrados[campo] = campo === 'termos' ? TEXTO_ACEITE : problema.message;
        }
      }
    }
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      const resultado = await escrever('POST', '/convites/cadastrar', { token, nome, senha, termos: true }, aceite);
      await abrirGrupo(resultado.grupoId);
    } catch (erro) {
      setEnviando(false);
      if (erro instanceof ErroApi && erro.status === 409 && erro.codigo === 'conta_existente') {
        setFalha('conta-existente');
      } else if (erro instanceof ErroApi && erro.status === 422 && erro.campos) {
        const vindos: Erros = {};
        for (const [chave, texto] of Object.entries(erro.campos)) {
          if (ehCampo(chave)) vindos[chave] = chave === 'termos' ? TEXTO_ACEITE : texto;
        }
        if (Object.keys(vindos).length > 0) setErros(vindos);
        else aoInvalido();
      } else if (ehLinkInvalido(erro)) {
        aoInvalido();
      } else {
        setFalha('conexao');
      }
    }
  };

  const comErro: ErroDeCampo[] = ORDEM.filter((c) => erros[c]).map((c) => ({ idCampo: c, rotulo: ROTULO[c] }));
  const erroAceite = erros.termos;
  return (
    <>
      <Apresentacao grupoNome={convite.grupoNome} />
      <p className="paragrafo">Crie sua conta para aceitar. O e-mail já está confirmado pelo convite.</p>
      <Formulario aoEnviar={() => void enviar()} enviando={enviando}>
        <ResumoErros erros={comErro} />
        <CampoTexto
          rotulo="Seu nome"
          autoComplete="name"
          maxLength={LIMITES.nomeAdmin.max}
          erro={erros.nome}
          valor={nome}
          aoMudar={setNome}
          id="nome"
        />
        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          autoComplete="username"
          ajuda="O convite foi enviado para este e-mail."
          somenteLeitura
          valor={convite.email}
          aoMudar={() => undefined}
          id="email"
        />
        <CampoSenha
          rotulo="Senha"
          autoComplete="new-password"
          comMostrar={false}
          ajuda={`De ${LIMITES.senha.min} a ${LIMITES.senha.max} caracteres.`}
          erro={erros.senha}
          valor={senha}
          aoMudar={setSenha}
          id="senha"
        />
        <div>
          <CaixaSelecao
            id="termos"
            marcada={aceitou}
            aoMudar={setAceitou}
            {...(erroAceite ? { 'aria-invalid': true as const, 'aria-describedby': 'termos-erro' } : {})}
            rotulo={
              <>
                Li e aceito os <Link to="/termos">termos de uso</Link> e a{' '}
                <Link to="/privacidade">política de privacidade</Link>
              </>
            }
          />
          {erroAceite ? (
            <p id="termos-erro" className={estilos.erroAceite}>
              <Icone nome="atencao" tamanho={16} />
              {erroAceite}
            </p>
          ) : null}
        </div>
        {falha === 'conta-existente' ? <Faixa tipo="erro">{TEXTO_CONTA_EXISTENTE}</Faixa> : null}
        {falha === 'conexao' ? <ErroEnvio /> : null}
        <Botao type="submit" bloco carregando={enviando} rotuloCarregando="Criando conta…">
          Criar conta e aceitar
        </Botao>
      </Formulario>
      <p className="paragrafo acima-4">
        Já tem conta com este e-mail? <Link to="/entrar">Entrar</Link>
      </p>
    </>
  );
}

/**
 * T40: `/convite#t=<token>`, aceitar o convite de admin (ACE-33 a ACE-36, ACE-55).
 * SPEC_DEVIATION: o mockup diz "<nome> convidou você"; `POST /api/convites/ler` devolve só e-mail, grupo e se a conta
 * existe (ACE-34), sem o nome de quem convidou, então o texto fica "Você foi convidado para administrar o grupo X".
 * SPEC_DEVIATION: com conta já existente e sem sessão, a spec não fixa o caminho; a tela manda entrar e abrir o link de
 * novo (o token não vai para a URL de `/entrar`, para não sair do fragmento, AD-010).
 */
export function Convite() {
  const { pronto, token } = usarTokenDoLink();
  // Só consulta a sessão quando há token: o link sem token é só a página de convite inválido (ACE-58).
  const temToken = pronto && token !== null;
  const sessao = useQuery({ queryKey: chaveSessao, queryFn: lerSessao, staleTime: 60_000, enabled: temToken });
  const [invalido, setInvalido] = useState(false);
  const [outroEmail, setOutroEmail] = useState(false);
  const lido = useQuery({
    queryKey: ['convite', token],
    queryFn: () => escrever('POST', '/convites/ler', { token }, conviteLido),
    enabled: temToken,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (!pronto)
    return (
      <PaginaAcesso titulo="Convite" ocupado>
        {null}
      </PaginaAcesso>
    );

  if (token === null || invalido || ehLinkInvalido(lido.error)) {
    return (
      <PaginaAcesso titulo="Convite inválido ou vencido">
        <Faixa tipo="atencao" papel="status">
          Este convite já foi usado, foi cancelado ou passou do prazo de 7 dias. Peça um novo ao admin do grupo.
        </Faixa>
        <div className="recuo-3">
          <BotaoLink to="/entrar" variante="secundario" bloco>
            Ir para entrar
          </BotaoLink>
        </div>
      </PaginaAcesso>
    );
  }

  if (lido.isError || sessao.isError) {
    const tentar = () => {
      if (lido.isError) void lido.refetch();
      if (sessao.isError) void sessao.refetch();
    };
    return (
      <PaginaAcesso titulo="Convite">
        <ErroRede aoTentar={tentar} />
      </PaginaAcesso>
    );
  }

  if (!lido.data || sessao.isPending) {
    return (
      <PaginaAcesso titulo="Convite" ocupado>
        <p className="sr" role="status">
          Carregando…
        </p>
        <FormaEsqueleto variante="linha" quantidade={2} />
        <FormaEsqueleto variante="botao" />
      </PaginaAcesso>
    );
  }

  const convite = lido.data;
  const conta = sessao.data;
  const mesmoEmail = conta !== null && conta !== undefined && conta.email.toLowerCase() === convite.email.toLowerCase();
  return (
    <PaginaAcesso titulo="Convite">
      {conta && (outroEmail || !mesmoEmail) ? <OutroEmail emailDaConta={conta.email} /> : null}
      {conta && !outroEmail && mesmoEmail ? (
        <AceitarConvite
          token={token}
          convite={convite}
          emailDaConta={conta.email}
          aoInvalido={() => setInvalido(true)}
          aoOutroEmail={() => setOutroEmail(true)}
        />
      ) : null}
      {!conta && convite.contaExiste ? (
        <>
          <Apresentacao grupoNome={convite.grupoNome} />
          <Faixa tipo="info">Este e-mail já tem conta. Entre e abra o link do convite de novo para aceitar.</Faixa>
          <div className="recuo-3">
            <BotaoLink to="/entrar" bloco>
              Ir para entrar
            </BotaoLink>
          </div>
        </>
      ) : null}
      {!conta && !convite.contaExiste ? (
        <CadastroPeloConvite token={token} convite={convite} aoInvalido={() => setInvalido(true)} />
      ) : null}
    </PaginaAcesso>
  );
}
