import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSessao } from '../../app/guarda.tsx';
import { Botao } from '../../componentes/Botao.tsx';
import { CampoSenha } from '../../componentes/Campo.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { CascaConta } from '../../componentes/MenuConta.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { destinoDoGrupo } from '../convite/Convite.tsx';
import estilos from '../acesso.module.css';

/**
 * Minha conta (`/app/conta`, t32; ACE-28, ACE-29, ACE-30, ACE-56):
 * - nome e e-mail da sessão (`t32-conta--sucesso`), "Trocar senha" para `/app/conta/senha`;
 * - "Excluir minha conta" abre o diálogo de alerta com a senha (`t32-conta--excluir`), que
 *   chama `POST /api/conta/excluir`;
 * - 204: vai a `/?aviso=conta-excluida` ("Sua conta foi excluída.", ACE-28) e só depois limpa o
 *   cache de consultas (limpar antes faria a guarda reler a sessão e mandar a `/entrar`);
 * - 409 `unico_admin`: fecha o diálogo e mostra a faixa com os grupos, cada um com o link para
 *   convidar outro admin (`t32-conta--unico-admin`, ACE-29);
 * - 401 `senha_atual_incorreta`: "Senha incorreta." no campo, nada apagado (ACE-30, comentário
 *   do `t32-conta--excluir`); outros erros (429, rede) numa faixa de erro dentro do diálogo.
 */

export const DESTINO_CONTA_EXCLUIDA = '/?aviso=conta-excluida';
export const TEXTO_UNICO_ADMIN =
  'Você é o único admin destes grupos. Convide outro admin ou arquive o grupo antes de excluir a conta.';
export const ERRO_SENHA_INCORRETA = 'Senha incorreta.';
export const ERRO_SENHA_VAZIA = 'Digite sua senha.';

const ID_FORMULARIO = 'form-excluir';

type GrupoUnico = ErroApi['grupos'][number];

export function MinhaConta() {
  const api = useCliente();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const { data } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | undefined>(undefined);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [unicoAdmin, setUnicoAdmin] = useState<GrupoUnico[] | null>(null);

  const conta = data?.tipo === 'ativa' ? data.sessao : null;

  function abrir() {
    setSenha('');
    setErroSenha(undefined);
    setFalha(null);
    setAberto(true);
  }

  async function excluir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setFalha(null);
    if (senha.length === 0) {
      setErroSenha(ERRO_SENHA_VAZIA);
      return;
    }
    setErroSenha(undefined);
    setEnviando(true);
    try {
      await api.post('/api/conta/excluir', { senha });
      await navegar(DESTINO_CONTA_EXCLUIDA, { replace: true });
      consultas.clear();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'unico_admin') {
        setUnicoAdmin(erro.grupos);
        setAberto(false);
      } else if (erro instanceof ErroApi && erro.codigo === 'senha_atual_incorreta') {
        setErroSenha(ERRO_SENHA_INCORRETA);
      } else {
        setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <CascaConta estreita>
      <LinkVoltar para="/app">Seus grupos</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Minha conta</h1>
      <Lista>
        <ItemLista titulo="Nome" meta={conta?.nome} />
        <ItemLista titulo="E-mail" meta={conta?.email} />
      </Lista>

      <section className={estilos.secao} aria-labelledby="seg">
        <h2 id="seg" className={estilos.subtitulo}>
          Segurança
        </h2>
        <LinkBotao para="/app/conta/senha" variante="secundario">
          Trocar senha
        </LinkBotao>
      </section>

      <section className={estilos.secao} aria-labelledby="exc">
        <h2 id="exc" className={estilos.subtitulo}>
          Excluir conta
        </h2>
        <p className={estilos.paragrafo}>
          Seu nome e seu e-mail são apagados e você perde o acesso a todos os grupos. Os dados dos grupos continuam com os
          outros admins.
        </p>
        {unicoAdmin ? (
          <>
            <Faixa tipo="erro">{TEXTO_UNICO_ADMIN}</Faixa>
            <Lista rotulo="Grupos em que você é o único admin">
              {unicoAdmin.map((g) => (
                <ItemLista key={g.id} titulo={g.nome} meta="Convidar admin" para={destinoDoGrupo(g.id)} seta />
              ))}
            </Lista>
          </>
        ) : null}
        <Botao variante="texto-destrutivo" onClick={abrir}>
          Excluir minha conta
        </Botao>
      </section>

      {aberto ? (
        <Dialogo
          alerta
          titulo="Excluir sua conta?"
          descricao="Não dá para desfazer. Digite sua senha para confirmar."
          aoFechar={() => setAberto(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Cancelar
              </Botao>
              <Botao type="submit" form={ID_FORMULARIO} variante="destrutivo" carregando={enviando}>
                {enviando ? 'Excluindo…' : 'Excluir conta'}
              </Botao>
            </>
          }
        >
          <form
            id={ID_FORMULARIO}
            className={`${estilos.formulario} ${estilos['acima-3']}`}
            noValidate
            aria-busy={enviando || undefined}
            onSubmit={excluir}
          >
            {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
            <CampoSenha
              id="senha-excluir"
              rotulo="Senha"
              autoComplete="current-password"
              erro={erroSenha}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </form>
        </Dialogo>
      ) : null}
    </CascaConta>
  );
}
