import { excluirCorpo } from '@pelada/contrato';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { CampoSenha } from '../../componentes/campos/CampoSenha';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { escrever, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { useSessao } from '../../dados/sessao';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

const TEXTO_SENHA_INCORRETA = 'Senha incorreta.';
const TEXTO_UNICO_ADMIN =
  'Você é o único admin destes grupos. Convide outro admin ou arquive o grupo antes de excluir a conta.';

interface GrupoDoAviso {
  id: string;
  nome: string;
}

/** Lê com cuidado a lista `grupos` do 409 `unico_admin` (ACE-29): só entram itens com id e nome. */
function gruposDoErro(erro: ErroApi): GrupoDoAviso[] {
  const bruto = erro.extras['grupos'];
  if (!Array.isArray(bruto)) return [];
  const grupos: GrupoDoAviso[] = [];
  for (const candidato of bruto as unknown[]) {
    if (typeof candidato !== 'object' || candidato === null) continue;
    const { id, nome } = candidato as Record<string, unknown>;
    if (typeof id === 'string' && typeof nome === 'string') grupos.push({ id, nome });
  }
  return grupos;
}

interface PropsDialogo {
  aoFechar: () => void;
  aoExcluida: () => void;
  aoUnicoAdmin: (grupos: GrupoDoAviso[]) => void;
}

/** Confirmação da exclusão com a senha (ACE-28, ACE-30). Destrutivo: Esc não fecha, o foco começa em Cancelar. */
function DialogoExcluir({ aoFechar, aoExcluida, aoUnicoAdmin }: PropsDialogo) {
  const refCancelar = useRef<HTMLButtonElement>(null);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const excluir = async () => {
    setFalhou(false);
    const analise = excluirCorpo.safeParse({ senha });
    if (!analise.success) {
      setErroSenha(analise.error.issues[0]?.message ?? 'Informe a senha.');
      return;
    }
    setErroSenha(undefined);
    setEnviando(true);
    try {
      await escrever('POST', '/conta/excluir', { senha }, semCorpo);
      aoExcluida();
    } catch (erro) {
      setEnviando(false);
      if (erro instanceof ErroApi && erro.status === 401 && erro.codigo === 'senha_atual_incorreta') {
        setErroSenha(TEXTO_SENHA_INCORRETA);
      } else if (erro instanceof ErroApi && erro.status === 409 && erro.codigo === 'unico_admin') {
        aoUnicoAdmin(gruposDoErro(erro));
      } else {
        setFalhou(true);
      }
    }
  };

  return (
    <Dialogo
      titulo="Excluir sua conta?"
      descricao="Não dá para desfazer. Digite sua senha para confirmar."
      destrutivo
      refFocoInicial={refCancelar}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao ref={refCancelar} variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="destrutivo"
            carregando={enviando}
            rotuloCarregando="Excluindo…"
            onClick={() => void excluir()}
          >
            Excluir conta
          </Botao>
        </>
      }
    >
      <Formulario aoEnviar={() => void excluir()} enviando={enviando} classe="acima-3">
        <CampoSenha
          id="senha-excluir"
          rotulo="Senha"
          autoComplete="current-password"
          erro={erroSenha}
          erroComoAlerta
          valor={senha}
          aoMudar={setSenha}
        />
        {falhou ? <ErroEnvio /> : null}
      </Formulario>
    </Dialogo>
  );
}

/** T38: `/app/conta`, dados da conta, troca de senha e exclusão (ACE-28 a ACE-30, ACE-55). */
export function MinhaConta() {
  const sessao = useSessao();
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [excluindo, setExcluindo] = useState(false);
  const [gruposUnicoAdmin, setGruposUnicoAdmin] = useState<GrupoDoAviso[] | null>(null);

  const excluida = () => {
    // Nada de dado da conta fica na memória; a sessão já foi encerrada pela API.
    cliente.clear();
    void navegar('/?aviso=conta-excluida', { replace: true });
  };

  return (
    <PaginaInterna titulo="Minha conta" voltarPara="/app" voltarRotulo="Seus grupos" comMenu ocupado={sessao.isPending}>
      {sessao.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={2} />
          <FormaEsqueleto variante="botao" />
        </>
      ) : null}
      {sessao.isError ? <ErroRede aoTentar={() => void sessao.refetch()} /> : null}
      {sessao.data ? (
        <>
          <Lista>
            <Item titulo="Nome" meta={sessao.data.nome} />
            <Item titulo="E-mail" meta={sessao.data.email} />
          </Lista>
          <section className="secao" aria-labelledby="seguranca">
            <h2 id="seguranca" className="subtitulo">
              Segurança
            </h2>
            <BotaoLink to="/app/conta/senha" variante="secundario">
              Trocar senha
            </BotaoLink>
          </section>
          <section className="secao" aria-labelledby="excluir">
            <h2 id="excluir" className="subtitulo">
              Excluir conta
            </h2>
            <p className="paragrafo">
              Seu nome e seu e-mail são apagados e você perde o acesso a todos os grupos. Os dados dos grupos continuam
              com os outros admins.
            </p>
            {gruposUnicoAdmin ? (
              <>
                <Faixa tipo="erro">{TEXTO_UNICO_ADMIN}</Faixa>
                <Lista>
                  {gruposUnicoAdmin.map((grupo) => (
                    <Item
                      key={grupo.id}
                      titulo={grupo.nome}
                      meta="Convidar admin"
                      para={`/app/grupos/${grupo.id}/admins`}
                    />
                  ))}
                </Lista>
              </>
            ) : null}
            <Botao variante="textoDestrutivo" onClick={() => setExcluindo(true)}>
              Excluir minha conta
            </Botao>
          </section>
        </>
      ) : null}
      {excluindo ? (
        <DialogoExcluir
          aoFechar={() => setExcluindo(false)}
          aoExcluida={excluida}
          aoUnicoAdmin={(grupos) => {
            setExcluindo(false);
            setGruposUnicoAdmin(grupos);
          }}
        />
      ) : null}
    </PaginaInterna>
  );
}
