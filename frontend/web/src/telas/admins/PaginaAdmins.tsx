import { adminsResposta, conviteCorpo, type AdminsResposta } from '@pelada/contrato';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { ErroRede } from '../../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../../componentes/basicos/Esqueleto';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Selo } from '../../componentes/basicos/Selo';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { escrever, ler, semCorpo } from '../../dados/cliente';
import { ErroApi } from '../../dados/erros';
import { useSessao } from '../../dados/sessao';
import { dataHoraCompleta } from '../../formatacao';
import { ehEmailIndisponivel, TEXTO_EMAIL_INDISPONIVEL } from '../compartilhado/falhas';
import { Formulario } from '../compartilhado/PaginaAcesso';
import { PaginaInterna } from '../compartilhado/PaginaInterna';

const TEXTO_JA_E_ADMIN = 'Essa pessoa já é admin do grupo.';
const TEXTO_ULTIMO_ADMIN = 'O grupo precisa de pelo menos uma pessoa admin.';

type Admin = AdminsResposta['admins'][number];

const chaveAdmins = (grupoId: string) => ['grupo', grupoId, 'admins'] as const;

function ehUltimoAdmin(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 409 && erro.codigo === 'ultimo_admin';
}

/** `2026-10-30T15:00:00Z` → `30/10/2026`, no fuso de São Paulo. */
const soData = (iso: string) => dataHoraCompleta(iso).slice(0, 10);

interface PropsRemover {
  grupoId: string;
  admin: Admin;
  aoFechar: () => void;
  aoRemovido: () => void;
  aoUltimoAdmin: () => void;
}

/** Confirmação de remoção (t19 remover, ACE-39). Destrutivo: Esc não fecha e o foco começa em Cancelar. */
function DialogoRemover({ grupoId, admin, aoFechar, aoRemovido, aoUltimoAdmin }: PropsRemover) {
  const refCancelar = useRef<HTMLButtonElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const remover = async () => {
    setFalhou(false);
    setEnviando(true);
    try {
      await escrever('DELETE', `/grupos/${grupoId}/admins/${admin.id}`, undefined, semCorpo);
      aoRemovido();
    } catch (erro) {
      setEnviando(false);
      if (ehUltimoAdmin(erro)) aoUltimoAdmin();
      else if (erro instanceof ErroApi && erro.status === 404) aoRemovido();
      else setFalhou(true);
    }
  };

  return (
    <Dialogo
      titulo={`Remover ${admin.nome} do grupo?`}
      descricao="Ele perde o acesso a este grupo na hora."
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
            rotuloCarregando="Removendo…"
            onClick={() => void remover()}
          >
            Remover do grupo
          </Botao>
        </>
      }
    >
      {falhou ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

/** Formulário de convite por e-mail (ACE-31, ACE-32). */
function ConvidarAdmin({
  grupoId,
  aoComecar,
  aoConvidar,
}: {
  grupoId: string;
  aoComecar: () => void;
  aoConvidar: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<'indisponivel' | 'conexao' | null>(null);

  const enviar = async () => {
    setFalha(null);
    aoComecar();
    const analise = conviteCorpo.safeParse({ email });
    if (!analise.success) {
      setErro(analise.error.issues[0]?.message ?? 'Informe um e-mail válido.');
      return;
    }
    setErro(undefined);
    setEnviando(true);
    try {
      await escrever('POST', `/grupos/${grupoId}/admins/convites`, { email }, semCorpo);
      setEmail('');
      aoConvidar(email);
    } catch (falhaEnvio) {
      if (falhaEnvio instanceof ErroApi && falhaEnvio.status === 409 && falhaEnvio.codigo === 'ja_e_admin') {
        setErro(TEXTO_JA_E_ADMIN);
      } else if (falhaEnvio instanceof ErroApi && falhaEnvio.status === 422 && falhaEnvio.campos?.['email']) {
        setErro(falhaEnvio.campos['email']);
      } else {
        setFalha(ehEmailIndisponivel(falhaEnvio) ? 'indisponivel' : 'conexao');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="secao" aria-labelledby="convidar">
      <h2 id="convidar" className="subtitulo">
        Convidar admin
      </h2>
      <p className="paragrafo">
        A pessoa recebe um link por e-mail. Se ainda não tiver conta, cria uma pelo próprio link.
      </p>
      <Formulario aoEnviar={() => void enviar()} enviando={enviando}>
        <CampoTexto
          id="email-convite"
          rotulo="E-mail"
          tipo="email"
          erro={erro}
          erroComoAlerta
          valor={email}
          aoMudar={setEmail}
        />
        {falha === 'indisponivel' ? <Faixa tipo="erro">{TEXTO_EMAIL_INDISPONIVEL}</Faixa> : null}
        {falha === 'conexao' ? <ErroEnvio /> : null}
        <div>
          <Botao type="submit" carregando={enviando} rotuloCarregando="Enviando…">
            Enviar convite
          </Botao>
        </div>
      </Formulario>
    </section>
  );
}

/** T41: `/app/grupos/:grupoId/admins`, admins, convites pendentes e convite por e-mail (ACE-31, 32, 37 a 40, 54). */
export function PaginaAdmins() {
  const { grupoId = '' } = useParams();
  const cliente = useQueryClient();
  const sessao = useSessao();
  const lista = useQuery({
    queryKey: chaveAdmins(grupoId),
    queryFn: () => ler(`/grupos/${grupoId}/admins`, adminsResposta),
    enabled: grupoId !== '',
  });
  const [removendo, setRemovendo] = useState<Admin | null>(null);
  const [avisoUltimo, setAvisoUltimo] = useState(false);
  const [convidado, setConvidado] = useState<string | null>(null);
  const [falhaCancelar, setFalhaCancelar] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const atualizar = () => void cliente.invalidateQueries({ queryKey: chaveAdmins(grupoId) });
  const nomeDoGrupo = sessao.data?.grupos.find((g) => g.id === grupoId)?.nome;

  const cancelar = async (conviteId: string) => {
    setFalhaCancelar(false);
    setCancelando(conviteId);
    try {
      await escrever('DELETE', `/grupos/${grupoId}/admins/convites/${conviteId}`, undefined, semCorpo);
      atualizar();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 404) atualizar();
      else setFalhaCancelar(true);
    } finally {
      setCancelando(null);
    }
  };

  const dados = lista.data;
  const soEu = dados !== undefined && dados.admins.length === 1;
  return (
    <PaginaInterna
      titulo="Admins"
      {...(nomeDoGrupo ? { nomeGrupo: nomeDoGrupo } : {})}
      destinoTrocarGrupo="/app"
      voltarPara="/app"
      voltarRotulo="Início"
      ocupado={lista.isPending}
    >
      {lista.isPending ? (
        <>
          <p className="sr" role="status">
            Carregando…
          </p>
          <FormaEsqueleto variante="linha" quantidade={3} />
        </>
      ) : null}
      {lista.isError ? <ErroRede aoTentar={() => void lista.refetch()} /> : null}
      {avisoUltimo ? <Faixa tipo="erro">{TEXTO_ULTIMO_ADMIN}</Faixa> : null}
      {convidado ? <Faixa tipo="sucesso">Convite enviado para {convidado}. Vale por 7 dias.</Faixa> : null}
      {dados ? (
        <>
          <Lista>
            {dados.admins.map((admin) => {
              const voce = admin.id === sessao.data?.id;
              return (
                <Item
                  key={admin.id}
                  quebra
                  titulo={voce ? `${admin.nome} (você)` : admin.nome}
                  meta={admin.email}
                  acoes={
                    <>
                      {admin.acessaFinanceiro ? <Selo>Financeiro</Selo> : null}
                      {voce || soEu ? null : (
                        <Botao
                          variante="textoDestrutivo"
                          aria-label={`Remover ${admin.nome}`}
                          onClick={() => {
                            setAvisoUltimo(false);
                            setRemovendo(admin);
                          }}
                        >
                          Remover
                        </Botao>
                      )}
                    </>
                  }
                />
              );
            })}
          </Lista>
          {soEu ? (
            <p className="ajuda acima-2">
              Você é o único admin deste grupo. Todo grupo precisa de pelo menos um admin.
            </p>
          ) : null}
          {dados.convites.length > 0 ? (
            <>
              <h2 className="subtitulo">Convites pendentes</h2>
              {falhaCancelar ? <ErroEnvio /> : null}
              <Lista>
                {dados.convites.map((convite) => (
                  <Item
                    key={convite.id}
                    quebra
                    titulo={convite.email}
                    meta={`Vale até ${soData(convite.expiraEm)}`}
                    acoes={
                      <Botao
                        variante="textoDestrutivo"
                        aria-label={`Cancelar convite de ${convite.email}`}
                        carregando={cancelando === convite.id}
                        onClick={() => void cancelar(convite.id)}
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
      ) : null}
      <ConvidarAdmin
        grupoId={grupoId}
        aoComecar={() => setConvidado(null)}
        aoConvidar={(email) => {
          setConvidado(email);
          atualizar();
        }}
      />
      {removendo ? (
        <DialogoRemover
          grupoId={grupoId}
          admin={removendo}
          aoFechar={() => setRemovendo(null)}
          aoRemovido={() => {
            setRemovendo(null);
            atualizar();
          }}
          aoUltimoAdmin={() => {
            setRemovendo(null);
            setAvisoUltimo(true);
          }}
        />
      ) : null}
    </PaginaInterna>
  );
}
