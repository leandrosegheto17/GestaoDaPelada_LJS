import { MENSAGENS_ERRO, type AdminsResposta } from '@pelada/contrato/acesso';
import { email as esquemaEmail } from '@pelada/contrato/primitivos';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useSessao } from '../../app/guarda.tsx';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { erroDoFinanceiro, useAlterarAcessoFinanceiro } from '../../dados/financeiro.ts';
import estilos from '../acesso.module.css';
import fin from '../financeiro/financeiro.module.css';

/**
 * Admins do grupo (`/app/grupos/:grupoId/admins`, t19; ACE-31, ACE-32, ACE-37 a ACE-40, ACE-56):
 * - `GET /api/grupos/:grupoId/admins` (ACE-37): admins (o da sessão com "(você)" e sem
 *   "Remover"; quem acessa o financeiro leva o selo "Financeiro") e os convites pendentes, com
 *   a validade; carregando (`t19-admins--carregando`) e erro com "Tentar de novo";
 * - convidar por e-mail (`#email-convite`, "Enviar convite"): `POST .../admins/convites`;
 *   sucesso mostra "Convite enviado para <e-mail>. Vale por 7 dias." e relê a lista
 *   (`t19-admins--convite-enviado`, ACE-31); 409 `ja_e_admin` marca o campo com "Essa pessoa já
 *   é admin do grupo." (`t19-admins--ja-admin`, ACE-32);
 * - cancelar convite: `DELETE .../admins/convites/:id` e relê a lista (ACE-38);
 * - remover admin, com o diálogo de confirmação (`t19-admins--remover`):
 *   `DELETE .../admins/:contaId` e relê a lista (ACE-39); 409 `ultimo_admin` mostra a faixa do
 *   último admin (ACE-40). Com um admin só, a lista mostra o aviso do `t19-admins--ultimo-admin`.
 *
 * A barra mostra o nome do grupo (da sessão) com "Trocar grupo" para `/app`
 * (`t19-admins--sucesso`).
 *
 * grupos-e-elenco T70 (SEC-001): a linha da criadora do grupo (`criador`) não tem "Remover", e o
 * 409 `criadora_nao_removivel` mostra a mensagem do contrato na faixa, com a lista relida.
 *
 * financeiro T44 (FIN-35, FIN-36, FIN-51): para quem acessa o financeiro, um interruptor "Acessa financeiro" por admin
 * (`InterruptorFinanceiro`), o da própria conta desabilitado com a ajuda; a troca chama o
 * `PATCH .../admins/:contaId/financeiro` e a tela redesenha com a lista devolvida; 409 e 403 mostram a mensagem na
 * faixa. Para quem não acessa, só o selo "Financeiro" nos que acessam.
 */

export const TEXTO_CONVITE_ENVIADO = (email: string) => `Convite enviado para ${email}. Vale por 7 dias.`;
export const ERRO_JA_ADMIN = 'Essa pessoa já é admin do grupo.';
export const ERRO_EMAIL = 'Informe um e-mail válido.';
export const TEXTO_UNICO_ADMIN_GRUPO = 'Você é o único admin deste grupo. Todo grupo precisa de pelo menos um admin.';
export const TEXTO_ULTIMO_ADMIN = 'O grupo precisa de pelo menos uma pessoa admin. Convide outra pessoa antes de remover esta.';
export const TEXTO_GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado.';
export const TEXTO_CRIADORA_NAO_REMOVIVEL = MENSAGENS_ERRO.criadora_nao_removivel;
export const ROTULO_ACESSA_FINANCEIRO = 'Acessa financeiro';
export const TEXTO_AJUDA_PROPRIO_ACESSO = 'Você não pode alterar o seu próprio acesso.';

type Admin = AdminsResposta['admins'][number];

export function chaveAdmins(grupoId: string) {
  return ['admins', grupoId] as const;
}

/** `2026-10-30T12:00:00.000Z` → `30/10/2026`, no fuso de Brasília. */
export function dataDoConvite(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Interruptor "Acessa financeiro" de um admin (financeiro T44; FIN-51), do mockup do legado
 * (`L:.md/mockup/telas/t19-admins--sucesso.html:18-19`) com o `.interruptor` de `financeiro.module.css` (tokens do
 * guia): `role="switch"`, rótulo "Acessa financeiro: <nome>", o `aria-checked` vem do `checked` nativo (o atributo
 * explícito num checkbox nativo é redundante e o axe pode acusar). O da própria conta fica
 * marcado conforme a permissão, desabilitado e com o texto de ajuda ligado por `aria-describedby`.
 * SPEC_DEVIATION: o estado "Financeiro" ao lado do trilho só aparece com o interruptor ligado (no legado aparece em
 * todos), para o texto visível dizer quem acessa, como o selo (e o `ACE-37` seguir achando um único "Financeiro").
 */
function InterruptorFinanceiro({ admin, eu, ocupado, aoAlternar }: { admin: Admin; eu: boolean; ocupado: boolean; aoAlternar: () => void }) {
  const idAjuda = `ajuda-acesso-${admin.id}`;
  return (
    <>
      <label className={fin.interruptor}>
        <input
          type="checkbox"
          role="switch"
          checked={admin.acessaFinanceiro}
          aria-label={`${ROTULO_ACESSA_FINANCEIRO}: ${admin.nome}`}
          aria-describedby={eu ? idAjuda : undefined}
          aria-busy={ocupado || undefined}
          disabled={eu || ocupado}
          onChange={aoAlternar}
        />
        <span className={fin['interruptor__trilho']} aria-hidden="true" />
        <span className={fin['interruptor__estado']} aria-hidden="true">
          {admin.acessaFinanceiro ? 'Financeiro' : ''}
        </span>
      </label>
      {eu ? (
        <p className={estilos.ajuda} id={idAjuda}>
          {TEXTO_AJUDA_PROPRIO_ACESSO}
        </p>
      ) : null}
    </>
  );
}

function Carregando() {
  return (
    <>
      <p className="sr" role="status">
        Carregando…
      </p>
      <div aria-hidden="true">
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
        <span className={`${estilos.esqueleto} ${estilos['esqueleto--linha']}`} />
      </div>
    </>
  );
}

export function Admins() {
  const { grupoId = '' } = useParams();
  const api = useCliente();
  const consultas = useQueryClient();
  const sessao = useSessao();
  const base = `/api/grupos/${encodeURIComponent(grupoId)}/admins`;
  const lista = useQuery<AdminsResposta>({
    queryKey: chaveAdmins(grupoId),
    queryFn: () => api.get<AdminsResposta>(base),
    retry: false,
  });

  const [email, setEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | undefined>(undefined);
  const [falhaConvite, setFalhaConvite] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [remover, setRemover] = useState<Admin | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [falhaLista, setFalhaLista] = useState<string | null>(null);
  const alterarAcesso = useAlterarAcessoFinanceiro(grupoId);

  const conta = sessao.data?.tipo === 'ativa' ? sessao.data.sessao : null;
  const nomeDoGrupo = conta?.grupos.find((g) => g.id === grupoId)?.nome ?? NOME_DO_APP;

  async function reler() {
    await consultas.invalidateQueries({ queryKey: chaveAdmins(grupoId) });
  }

  function alternarAcesso(a: Admin) {
    if (alterarAcesso.isPending) return;
    setFalhaLista(null);
    // A lista devolvida pelo PATCH substitui a dos admins (`useAlterarAcessoFinanceiro`); a tela redesenha com ela.
    alterarAcesso.mutate(
      { contaId: a.id, acessaFinanceiro: !a.acessaFinanceiro },
      {
        onError: (erro) => {
          // FIN-36: 409 `acao_na_propria_conta` e 403 `sem_permissao_financeiro` com a mensagem do contrato.
          setFalhaLista(erroDoFinanceiro(erro).mensagem);
          void reler();
        },
      },
    );
  }

  async function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setFalhaConvite(null);
    setEnviado(null);
    const valido = esquemaEmail.safeParse(email);
    if (!valido.success) {
      setErroEmail(ERRO_EMAIL);
      return;
    }
    setErroEmail(undefined);
    setEnviando(true);
    try {
      await api.post(`${base}/convites`, { email: valido.data });
      setEnviado(valido.data);
      setEmail('');
      await reler();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'ja_e_admin') setErroEmail(ERRO_JA_ADMIN);
      else if (erro instanceof ErroApi && erro.campos.includes('email')) setErroEmail(ERRO_EMAIL);
      else setFalhaConvite(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setEnviando(false);
    }
  }

  async function cancelarConvite(id: string) {
    setFalhaLista(null);
    try {
      await api.delete(`${base}/convites/${encodeURIComponent(id)}`);
    } catch (erro) {
      // Convite que já não existe (404) só some da lista ao reler.
      if (!(erro instanceof ErroApi && erro.status === 404)) setFalhaLista(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    }
    await reler();
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setFalhaLista(null);
    setRemovendo(true);
    try {
      await api.delete(`${base}/${encodeURIComponent(remover.id)}`);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.codigo === 'ultimo_admin') setFalhaLista(TEXTO_ULTIMO_ADMIN);
      else if (erro instanceof ErroApi && erro.codigo === 'criadora_nao_removivel') setFalhaLista(TEXTO_CRIADORA_NAO_REMOVIVEL);
      else if (!(erro instanceof ErroApi && erro.status === 404)) setFalhaLista(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setRemovendo(false);
      setRemover(null);
    }
    await reler();
  }

  function conteudoDaLista() {
    if (lista.isPending) return <Carregando />;
    if (lista.isError) {
      if (lista.error instanceof ErroApi && lista.error.status === 404) {
        return <Faixa tipo="atencao">{TEXTO_GRUPO_NAO_ENCONTRADO}</Faixa>;
      }
      return <EstadoErro aoTentarDeNovo={() => void lista.refetch()} />;
    }
    const { admins, convites } = lista.data;
    // FIN-51: quem acessa o financeiro (a própria linha da lista, a mais recente) vê o interruptor; os outros, o selo.
    const euAcesso = admins.find((a) => a.id === conta?.id)?.acessaFinanceiro === true;
    return (
      <>
        {falhaLista ? <Faixa tipo="erro">{falhaLista}</Faixa> : null}
        <Lista rotulo="Admins">
          {admins.map((a) => {
            const eu = a.id === conta?.id;
            return (
              <ItemLista
                key={a.id}
                titulo={eu ? `${a.nome} (você)` : a.nome}
                meta={a.email}
                lateral={
                  <>
                    {euAcesso ? (
                      <InterruptorFinanceiro
                        admin={a}
                        eu={eu}
                        ocupado={alterarAcesso.isPending && alterarAcesso.variables?.contaId === a.id}
                        aoAlternar={() => alternarAcesso(a)}
                      />
                    ) : a.acessaFinanceiro ? (
                      <span className={`${estilos.selo} ${estilos['selo--neutro']}`}>Financeiro</span>
                    ) : null}
                    {eu || a.criador === true ? null : (
                      <Botao variante="texto-destrutivo" aria-label={`Remover ${a.nome}`} onClick={() => setRemover(a)}>
                        Remover
                      </Botao>
                    )}
                  </>
                }
              />
            );
          })}
        </Lista>
        {admins.length === 1 ? <p className={`${estilos.ajuda} ${estilos['acima-2']}`}>{TEXTO_UNICO_ADMIN_GRUPO}</p> : null}
        {convites.length > 0 ? (
          <>
            <h2 className={estilos.subtitulo}>Convites pendentes</h2>
            <Lista rotulo="Convites pendentes">
              {convites.map((c) => (
                <ItemLista
                  key={c.id}
                  titulo={c.email}
                  meta={`Vale até ${dataDoConvite(c.expiraEm)}`}
                  lateral={
                    <Botao
                      variante="texto-destrutivo"
                      aria-label={`Cancelar convite de ${c.email}`}
                      onClick={() => void cancelarConvite(c.id)}
                    >
                      Cancelar convite
                    </Botao>
                  }
                />
              ))}
            </Lista>
          </>
        ) : null}
      </>
    );
  }

  return (
    <Casca grupo={{ nome: nomeDoGrupo, trocarHref: '/app' }} estreita ocupada={lista.isPending}>
      <LinkVoltar para="/app">Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Admins</h1>
      {enviado ? <Faixa tipo="sucesso">{TEXTO_CONVITE_ENVIADO(enviado)}</Faixa> : null}
      {conteudoDaLista()}

      <section className={estilos.secao} aria-labelledby="add">
        <h2 id="add" className={estilos.subtitulo}>
          Convidar admin
        </h2>
        <p className={estilos.paragrafo}>A pessoa recebe um link por e-mail. Se ainda não tiver conta, cria uma pelo próprio link.</p>
        <form className={estilos.formulario} noValidate aria-busy={enviando || undefined} onSubmit={convidar}>
          {falhaConvite ? <Faixa tipo="erro">{falhaConvite}</Faixa> : null}
          <Campo
            id="email-convite"
            rotulo="E-mail"
            type="email"
            inputMode="email"
            autoComplete="off"
            erro={erroEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <Botao type="submit" carregando={enviando}>
              {enviando ? 'Enviando…' : 'Enviar convite'}
            </Botao>
          </div>
        </form>
      </section>

      {remover ? (
        <Dialogo
          alerta
          titulo={`Remover ${remover.nome} do grupo?`}
          descricao="A pessoa perde o acesso a este grupo na hora."
          aoFechar={() => setRemover(null)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setRemover(null)}>
                Cancelar
              </Botao>
              <Botao variante="destrutivo" carregando={removendo} onClick={() => void confirmarRemocao()}>
                Remover do grupo
              </Botao>
            </>
          }
        />
      ) : null}
    </Casca>
  );
}
