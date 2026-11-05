import { TERMOS_VERSAO } from '@pelada/contrato/acesso';
import {
  DIAS_DE_TRIAL,
  formatarPreco,
  LIMITE_GRUPOS_FREE,
  LIMITE_JOGADORES_FREE,
  PRECO_PRO_CENTAVOS,
} from '@pelada/dominio';
import { Casca } from '../../componentes/Casca.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import estilos from '../acesso.module.css';

/**
 * Páginas públicas de Termos de uso (`/termos`, t33) e Privacidade (`/privacidade`, t07)
 * (ACE-58, ACE-60): abrem sem sessão, mostram a versão `TERMOS_VERSAO` (`AAAA-MM-DD`, a mesma
 * gravada no aceite do cadastro) e o selo "Rascunho para revisão" até o usuário aprovar o texto.
 *
 * Texto: RASCUNHO do agente, a partir do mockup (`t33-termos--pagina.html`,
 * `t07-privacidade--pagina.html`). Não é texto jurídico revisado: o usuário revisa e aprova a
 * versão; ao aprovar, troca `TEXTO_EM_RASCUNHO` para `false` e a data de `TERMOS_VERSAO`.
 *
 * Planos e cobrança (planos-e-cobranca T54; PLA-66, PLA-67), também RASCUNHO para revisão: os planos, o trial, a queda
 * para o Free sem apagar dados e o cancelamento entram nas seções "O serviço" e "Encerramento" dos termos, e o Asaas
 * como operador entra em "O que guardamos" da privacidade. Preço e limites vêm da tabela do domínio, nunca escritos
 * aqui. Ficam dentro das seções que já existem porque o teste das páginas (ACE-58) confere a lista de seções; uma seção
 * própria de cobrança pede a troca daquele teste, com aprovação.
 */

const PRECO_PRO = `${formatarPreco(PRECO_PRO_CENTAVOS)} por mês por grupo`;

export const TEXTO_PLANOS =
  `Há dois planos. O Free é grátis, com partidas e ranking (inclusive o link público), até ${LIMITE_JOGADORES_FREE} jogadores ativos e ${LIMITE_GRUPOS_FREE} grupo por organizador. ` +
  `O Pro custa ${PRECO_PRO}, sem limite de jogadores, com simulador de times, financeiro, PDF do ranking e avisos no celular. ` +
  `Todo grupo novo começa com ${DIAS_DE_TRIAL} dias de Pro grátis, sem cartão. ` +
  'Quando o trial acaba, ou quando um pagamento atrasa, é estornado ou a assinatura é cancelada e o período pago termina, o grupo volta ao Free na hora: nada é apagado, e o que passa do limite do Free fica só para leitura até o grupo voltar ao limite ou assinar o Pro.';

export const TEXTO_CANCELAMENTO =
  'A assinatura do Pro é cancelada em Meu plano, por quem criou o grupo. O grupo continua Pro até o fim do período já pago e depois volta ao Free, sem perder dados. Enquanto houver assinatura ativa ou aguardando pagamento, o grupo não pode ser arquivado nem a conta de quem o criou pode ser excluída: cancele a assinatura antes.';

export const TEXTO_PAGAMENTO =
  'Pagamentos: a cobrança do Pro é feita pelo Asaas, que atua como operador dos dados de pagamento. Para assinar, quem criou o grupo informa nome e CPF, que enviamos ao Asaas junto com o e-mail da conta; o app não guarda o CPF nem dado de cartão (a forma de pagamento é escolhida na fatura do Asaas) e guarda só o id do cliente no Asaas e a situação da assinatura.';

export const TEXTO_EM_RASCUNHO = true;
export const SELO_RASCUNHO = 'Rascunho para revisão';

interface Secao {
  titulo: string;
  texto: string;
}

export const SECOES_TERMOS: readonly Secao[] = [
  {
    titulo: 'O serviço',
    texto: `O Gestão da Pelada ajuda o organizador a controlar presença, times, ranking e caixa de um grupo de futebol entre amigos. ${TEXTO_PLANOS}`,
  },
  {
    titulo: 'Sua conta',
    texto:
      'Você é responsável pelos dados que cadastra e por manter sua senha em segredo. Os jogadores do grupo não precisam de conta.',
  },
  {
    titulo: 'Encerramento',
    texto: `Você pode excluir sua conta a qualquer momento em Minha conta. ${TEXTO_CANCELAMENTO}`,
  },
];

export const SECOES_PRIVACIDADE: readonly Secao[] = [
  {
    titulo: 'O que guardamos',
    texto:
      'Do jogador: apelido, ano de nascimento, posição, telefone (opcional), data de entrada no grupo, presenças e as notas de habilidade dadas pelos admins. Dos admins: nome, e-mail, a senha guardada de um jeito que ninguém consegue ler, e a data em que aceitou estes termos. Do uso do app: contagens anônimas, sem nome, telefone nem localização. ' +
      TEXTO_PAGAMENTO,
  },
  {
    titulo: 'E-mails',
    texto:
      'Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin.',
  },
  {
    titulo: 'Quem vê',
    texto:
      'Qualquer pessoa com o link do grupo vê o ranking: apelido, colocação e pontos. Telefone, idade, posição, notas, nível e o caixa ficam só com os admins do grupo.',
  },
  {
    titulo: 'Como excluir seus dados',
    texto:
      'Admin: em Minha conta, use "Excluir minha conta". Jogador: fale com o admin do seu grupo, que pode excluir ou inativar o cadastro.',
  },
];

function PaginaTexto({
  titulo,
  voltar,
  secoes,
}: {
  titulo: string;
  voltar: string;
  secoes: readonly Secao[];
}) {
  return (
    <Casca estreita>
      <LinkVoltar para={voltar}>Voltar</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>{titulo}</h1>
      <p className={estilos['acima-2']}>
        {TEXTO_EM_RASCUNHO ? (
          <span className={`${estilos.selo} ${estilos['selo--atencao']}`}>{SELO_RASCUNHO}</span>
        ) : null}{' '}
        <span className={estilos['texto-sec']}>Versão {TERMOS_VERSAO}</span>
      </p>
      {secoes.map((s) => (
        <section key={s.titulo}>
          <h2 className={estilos.subtitulo}>{s.titulo}</h2>
          <p className={estilos.paragrafo}>{s.texto}</p>
        </section>
      ))}
    </Casca>
  );
}

export function Termos() {
  return <PaginaTexto titulo="Termos de uso" voltar="/cadastro" secoes={SECOES_TERMOS} />;
}

export function Privacidade() {
  return <PaginaTexto titulo="Privacidade" voltar="/" secoes={SECOES_PRIVACIDADE} />;
}
