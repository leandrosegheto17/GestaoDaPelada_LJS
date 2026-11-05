import { assinaturaCorpo } from '@pelada/contrato/plano';
import { formatarPreco, PRECO_PRO_CENTAVOS } from '@pelada/dominio';
import { useState, type FormEvent } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { erroDePlano, useAssinar } from '../../dados/plano.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';

/**
 * Assinar o Pro em Meu plano (planos-e-cobranca T45; PLA-53, PLA-34, PLA-35; AD-064). Só para a criadora sem
 * assinatura pendente nem ativa (Meu plano decide quando mostrar):
 * - o título "Assinar Pro: R$ 9,90/mês", com o preço da tabela do domínio;
 * - nome e CPF, validados pelo mesmo contrato da API (`assinaturaCorpo`) antes do envio: CPF inválido mostra o erro ao
 *   lado do campo e não chama a API (PLA-35); a API valida de novo (422 por campo);
 * - sucesso: abre a fatura do Asaas (`window.open` com a `faturaUrl`, PLA-53); o plano é relido pelo `useAssinar`;
 * - 502: a mensagem da API e "Tentar de novo", que reenvia o mesmo formulário (PLA-36);
 * - 409 `assinatura_pendente`: abre a fatura em aberto, se houver (outra aba já tinha assinado);
 * - nenhum campo de cartão: o pagamento é na fatura do Asaas (PLA-34).
 */

export type CampoAssinatura = 'nome' | 'cpf';

export const CAMPOS_ASSINATURA: readonly { campo: CampoAssinatura; id: string; rotulo: string }[] =
  [
    { campo: 'nome', id: 'assinatura-nome', rotulo: 'Nome completo' },
    { campo: 'cpf', id: 'assinatura-cpf', rotulo: 'CPF' },
  ];

export function tituloAssinarPro(): string {
  return `Assinar Pro: ${formatarPreco(PRECO_PRO_CENTAVOS)}/mês`;
}

type Erros = Partial<Record<CampoAssinatura, string>>;

/** Erros de cada campo pelo contrato, sem chamar a API. */
export function validarAssinatura(dados: { nome: string; cpf: string }): Erros {
  const r = assinaturaCorpo.safeParse(dados);
  if (r.success) return {};
  const erros: Erros = {};
  for (const problema of r.error.issues) {
    const campo = problema.path[0];
    if ((campo === 'nome' || campo === 'cpf') && !erros[campo]) erros[campo] = problema.message;
  }
  return erros;
}

function abrirFatura(url: string): void {
  window.open(url, '_blank', 'noopener');
}

export function AssinarPro({ grupoId }: { grupoId: string }) {
  const assinar = useAssinar(grupoId);
  const [dados, setDados] = useState({ nome: '', cpf: '' });
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState<string | null>(null);

  function enviar() {
    if (assinar.isPending) return;
    setFalha(null);
    const locais = validarAssinatura(dados);
    setErros(locais);
    if (Object.keys(locais).length > 0) return;
    const corpo = assinaturaCorpo.parse(dados);
    assinar.mutate(corpo, {
      onSuccess: (r) => abrirFatura(r.faturaUrl),
      onError: (erro) => {
        const dePlano = erroDePlano(erro);
        if (dePlano?.tipo === 'assinatura_pendente') {
          if (dePlano.faturaUrl) abrirFatura(dePlano.faturaUrl);
          return;
        }
        if (dePlano?.tipo === 'pagamento_indisponivel') {
          setFalha(dePlano.mensagem);
          return;
        }
        const porCampo = mensagensDosCampos(erro);
        const deCampo: Erros = {};
        if (porCampo.nome) deCampo.nome = porCampo.nome;
        if (porCampo.cpf) deCampo.cpf = porCampo.cpf;
        setErros(deCampo);
        if (Object.keys(deCampo).length === 0)
          setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      },
    });
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    enviar();
  }

  const resumo = CAMPOS_ASSINATURA.filter((c) => erros[c.campo]).map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
  }));

  return (
    <section className={modulo.cartao} aria-labelledby="t-assinar">
      <h2 id="t-assinar" className={estilos.subtitulo}>
        {tituloAssinarPro()}
      </h2>
      <form
        className={estilos.formulario}
        noValidate
        aria-busy={assinar.isPending || undefined}
        onSubmit={aoEnviar}
      >
        <ResumoErros erros={resumo} />
        {falha ? (
          <Faixa
            tipo="erro"
            acao={
              <Botao variante="secundario" onClick={enviar}>
                Tentar de novo
              </Botao>
            }
          >
            {falha}
          </Faixa>
        ) : null}
        <Campo
          id="assinatura-nome"
          rotulo="Nome completo"
          autoComplete="name"
          maxLength={100}
          erro={erros.nome}
          value={dados.nome}
          onChange={(e) => setDados((d) => ({ ...d, nome: e.target.value }))}
        />
        <Campo
          id="assinatura-cpf"
          rotulo="CPF"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          ajuda="Só para a cobrança no Asaas; o app não guarda o CPF."
          erro={erros.cpf}
          value={dados.cpf}
          onChange={(e) => setDados((d) => ({ ...d, cpf: e.target.value }))}
        />
        <p>O pagamento é feito na fatura do Asaas (Pix, boleto ou cartão).</p>
        <Botao type="submit" carregando={assinar.isPending}>
          {assinar.isPending ? 'Abrindo a fatura…' : 'Assinar Pro'}
        </Botao>
      </form>
    </section>
  );
}
