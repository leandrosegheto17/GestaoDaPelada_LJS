import { cadastroCorpo, LIMITES } from '@pelada/contrato';
import { useState } from 'react';
import { Link } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Icone } from '../../componentes/basicos/Icone';
import { CampoSenha } from '../../componentes/campos/CampoSenha';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { ResumoErros, type ErroDeCampo } from '../../componentes/campos/ResumoErros';
import { CaixaSelecao } from '../../componentes/escolhas/CaixaSelecao';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { ehEmailIndisponivel, TEXTO_EMAIL_INDISPONIVEL } from '../compartilhado/falhas';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';
import estilos from './Cadastro.module.css';

const TEXTO_SUCESSO = 'Enviamos um link de confirmação para o seu e-mail. Ele vale por 24 horas.';
const TEXTO_ACEITE = 'Aceite os termos para criar a conta.';

type Campo = 'nome' | 'email' | 'senha' | 'termos';
type Erros = Partial<Record<Campo, string>>;

const ROTULO: Record<Campo, string> = {
  nome: 'Seu nome',
  email: 'E-mail',
  senha: 'Senha',
  termos: 'Aceite dos termos',
};
const ORDEM: Campo[] = ['nome', 'email', 'senha', 'termos'];

function ehCampo(chave: string): chave is Campo {
  return ORDEM.includes(chave as Campo);
}

/** Confere os campos com o mesmo schema da API (ACE-02, ACE-03). */
function validar(dados: { nome: string; email: string; senha: string; aceitou: boolean }): Erros {
  const analise = cadastroCorpo.safeParse({
    nome: dados.nome,
    email: dados.email,
    senha: dados.senha,
    termos: dados.aceitou,
  });
  const erros: Erros = {};
  if (analise.success) return erros;
  for (const problema of analise.error.issues) {
    const campo = String(problema.path[0]);
    if (ehCampo(campo) && erros[campo] === undefined) {
      erros[campo] = campo === 'termos' ? TEXTO_ACEITE : problema.message;
    }
  }
  return erros;
}

/** T29: criar conta com aceite dos termos (ACE-01 a ACE-03, ACE-59). */
export function Cadastro() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<'indisponivel' | 'conexao' | null>(null);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    setFalha(null);
    const encontrados = validar({ nome, email, senha, aceitou });
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      await escrever('POST', '/conta', { nome, email, senha, termos: true }, semCorpo);
      setEnviado(true);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 422) {
        const vindos: Erros = {};
        for (const [chave, texto] of Object.entries(erro.campos ?? {})) {
          if (ehCampo(chave)) vindos[chave] = chave === 'termos' ? TEXTO_ACEITE : texto;
        }
        if (erro.codigo === 'termos_obrigatorios') vindos.termos = TEXTO_ACEITE;
        if (Object.keys(vindos).length > 0) {
          setErros(vindos);
          return;
        }
      }
      setFalha(ehEmailIndisponivel(erro) ? 'indisponivel' : 'conexao');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <PaginaAcesso titulo="Verifique seu e-mail">
        <Faixa tipo="info">{TEXTO_SUCESSO}</Faixa>
        <p className="paragrafo acima-3">Não chegou? Confira a caixa de spam ou peça outro link.</p>
        <BotaoLink to="/confirmar" variante="secundario" bloco>
          Enviar outro link
        </BotaoLink>
        <BotaoLink to="/entrar" variante="texto">
          Voltar para entrar
        </BotaoLink>
      </PaginaAcesso>
    );
  }

  const comErro: ErroDeCampo[] = ORDEM.filter((c) => erros[c]).map((c) => ({ idCampo: c, rotulo: ROTULO[c] }));
  const erroAceite = erros.termos;
  return (
    <PaginaAcesso titulo="Criar conta" voltarPara="/entrar" voltarRotulo="Voltar para entrar">
      <p className="paragrafo">Organize presença, times e ranking da sua pelada. Grátis para começar.</p>
      <Formulario aoEnviar={() => void enviar()} enviando={enviando}>
        <ResumoErros erros={comErro} />
        <CampoTexto
          rotulo="Seu nome"
          autoComplete="name"
          maxLength={LIMITES.nomeAdmin.max}
          ajuda="Como os outros admins vão ver você."
          erro={erros.nome}
          valor={nome}
          aoMudar={setNome}
          id="nome"
        />
        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          autoComplete="username"
          maxLength={LIMITES.emailMax}
          erro={erros.email}
          valor={email}
          aoMudar={setEmail}
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
        {falha === 'indisponivel' ? <Faixa tipo="erro">{TEXTO_EMAIL_INDISPONIVEL}</Faixa> : null}
        {falha === 'conexao' ? <ErroEnvio /> : null}
        <Botao type="submit" bloco carregando={enviando} rotuloCarregando="Criando conta…">
          Criar conta
        </Botao>
        <BotaoLink to="/entrar" variante="texto">
          Já tenho conta
        </BotaoLink>
      </Formulario>
    </PaginaAcesso>
  );
}
