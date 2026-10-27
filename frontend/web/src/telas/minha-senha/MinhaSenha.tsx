import { trocarSenhaCorpo } from '@pelada/contrato';
import { useState } from 'react';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CampoSenha } from '../../componentes/campos/CampoSenha';
import { CamposNovaSenha, ID_CONFIRMACAO, ID_NOVA_SENHA } from '../../componentes/campos/CamposNovaSenha';
import { ResumoErros, type ErroDeCampo } from '../../componentes/campos/ResumoErros';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

const ID_ATUAL = 'atual';
const TEXTO_DIFERENTES = 'As senhas não conferem.';
const TEXTO_ATUAL_INCORRETA = 'Senha atual incorreta.';
const TEXTO_SUCESSO = 'Senha trocada. Outros aparelhos foram desconectados.';

interface Erros {
  atual?: string | undefined;
  novaSenha?: string | undefined;
  confirmacao?: string | undefined;
}

/** Mesmas regras do contrato (schema da API) e confirmação igual (ACE-26). */
function validar(atual: string, nova: string, confirmacao: string): Erros {
  const erros: Erros = {};
  const analise = trocarSenhaCorpo.safeParse({ senhaAtual: atual, novaSenha: nova });
  if (!analise.success) {
    erros.atual = analise.error.issues.find((i) => i.path[0] === 'senhaAtual')?.message;
    erros.novaSenha = analise.error.issues.find((i) => i.path[0] === 'novaSenha')?.message;
  }
  if (nova !== confirmacao) erros.confirmacao = TEXTO_DIFERENTES;
  return erros;
}

/** T39: `/app/conta/senha`, trocar a senha estando logada (ACE-26, ACE-27, ACE-54). */
export function MinhaSenha() {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [trocada, setTrocada] = useState(false);

  const trocar = async () => {
    setFalhou(false);
    setTrocada(false);
    const encontrados = validar(atual, nova, confirmacao);
    setErros(encontrados);
    if (encontrados.atual || encontrados.novaSenha || encontrados.confirmacao) return;
    setEnviando(true);
    try {
      await escrever('POST', '/conta/senha', { senhaAtual: atual, novaSenha: nova }, semCorpo);
      setAtual('');
      setNova('');
      setConfirmacao('');
      setTrocada(true);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 401 && erro.codigo === 'senha_atual_incorreta') {
        setErros({ atual: TEXTO_ATUAL_INCORRETA });
      } else {
        setFalhou(true);
      }
    } finally {
      setEnviando(false);
    }
  };

  const comErro: ErroDeCampo[] = [
    ...(erros.atual ? [{ idCampo: ID_ATUAL, rotulo: 'Senha atual' }] : []),
    ...(erros.novaSenha ? [{ idCampo: ID_NOVA_SENHA, rotulo: 'Nova senha' }] : []),
    ...(erros.confirmacao ? [{ idCampo: ID_CONFIRMACAO, rotulo: 'Confirmar nova senha' }] : []),
  ];
  return (
    <PaginaInterna titulo="Minha senha" voltarPara="/app" voltarRotulo="Início">
      {trocada ? <Faixa tipo="sucesso">{TEXTO_SUCESSO}</Faixa> : null}
      <Formulario aoEnviar={() => void trocar()} enviando={enviando}>
        <ResumoErros erros={comErro} />
        <CampoSenha
          id={ID_ATUAL}
          rotulo="Senha atual"
          autoComplete="current-password"
          comMostrar={false}
          erro={erros.atual}
          erroComoAlerta={comErro.length === 1}
          valor={atual}
          aoMudar={setAtual}
        />
        <CamposNovaSenha
          nova={nova}
          confirmacao={confirmacao}
          aoMudarNova={setNova}
          aoMudarConfirmacao={setConfirmacao}
          erros={erros}
          erroComoAlerta={comErro.length === 1}
        />
        {falhou ? <ErroEnvio /> : null}
        <Botao type="submit" carregando={enviando} rotuloCarregando="Trocando…">
          Trocar senha
        </Botao>
      </Formulario>
    </PaginaInterna>
  );
}
