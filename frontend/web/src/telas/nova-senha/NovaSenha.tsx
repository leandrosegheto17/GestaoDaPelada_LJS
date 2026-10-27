import { novaSenhaCorpo } from '@pelada/contrato';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CamposNovaSenha, ID_CONFIRMACAO, ID_NOVA_SENHA } from '../../componentes/campos/CamposNovaSenha';
import { ResumoErros, type ErroDeCampo } from '../../componentes/campos/ResumoErros';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { Formulario, PaginaAcesso } from '../compartilhado/PaginaAcesso';
import { usarTokenDoLink } from '../compartilhado/usarTokenDoLink';

const TEXTO_DIFERENTES = 'As senhas não conferem.';

interface Erros {
  novaSenha?: string | undefined;
  confirmacao?: string | undefined;
}

/** Link vencido, já usado ou malformado: a API responde 410 (ACE-25) ou 422 (token fora do formato). */
function ehLinkInvalido(erro: unknown): boolean {
  return erro instanceof ErroApi && (erro.status === 410 || erro.status === 422);
}

/** Regra de senha do contrato (mesmo schema da API) e confirmação igual. */
function validar(token: string, nova: string, confirmacao: string): Erros {
  const erros: Erros = {};
  const analise = novaSenhaCorpo.safeParse({ token, senha: nova });
  if (!analise.success) {
    erros.novaSenha = analise.error.issues.find((i) => i.path[0] === 'senha')?.message;
  }
  if (nova !== confirmacao) erros.confirmacao = TEXTO_DIFERENTES;
  return erros;
}

/** T06: criar a nova senha a partir do link de recuperação (`#t=`), ACE-24 e ACE-25. */
export function NovaSenha() {
  const { pronto, token } = usarTokenDoLink();
  const navegar = useNavigate();
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [invalido, setInvalido] = useState(false);
  const [falhou, setFalhou] = useState(false);

  if (!pronto) return null;

  if (token === null || invalido) {
    return (
      <PaginaAcesso titulo="Link inválido ou vencido">
        <Faixa tipo="atencao">Este link já foi usado ou passou do prazo de 1 hora.</Faixa>
        <div className="acima-3">
          <BotaoLink to="/entrar/esqueci" bloco>
            Pedir novo link
          </BotaoLink>
        </div>
        <BotaoLink to="/entrar" variante="texto">
          Voltar para entrar
        </BotaoLink>
      </PaginaAcesso>
    );
  }

  const salvar = async () => {
    setFalhou(false);
    const encontrados = validar(token, nova, confirmacao);
    setErros(encontrados);
    if (encontrados.novaSenha || encontrados.confirmacao) return;
    setEnviando(true);
    try {
      await escrever('POST', '/sessao/nova-senha', { token, senha: nova }, semCorpo);
      void navegar('/entrar?aviso=senha-alterada', { replace: true });
    } catch (erro) {
      if (ehLinkInvalido(erro)) setInvalido(true);
      else setFalhou(true);
      setEnviando(false);
    }
  };

  const comErro: ErroDeCampo[] = [
    ...(erros.novaSenha ? [{ idCampo: ID_NOVA_SENHA, rotulo: 'Nova senha' }] : []),
    ...(erros.confirmacao ? [{ idCampo: ID_CONFIRMACAO, rotulo: 'Confirmar nova senha' }] : []),
  ];
  return (
    <PaginaAcesso titulo="Crie uma nova senha">
      <p className="paragrafo">
        Depois de salvar, todos os aparelhos conectados à sua conta saem e você entra de novo com a senha nova.
      </p>
      <Formulario aoEnviar={() => void salvar()} enviando={enviando}>
        <ResumoErros erros={comErro} />
        <CamposNovaSenha
          nova={nova}
          confirmacao={confirmacao}
          aoMudarNova={setNova}
          aoMudarConfirmacao={setConfirmacao}
          erros={erros}
          erroComoAlerta={comErro.length === 1}
        />
        {falhou ? <ErroEnvio /> : null}
        <Botao type="submit" bloco carregando={enviando} rotuloCarregando="Salvando…">
          Salvar nova senha
        </Botao>
      </Formulario>
    </PaginaAcesso>
  );
}
