import { PaginaTexto } from '../compartilhado/PaginaTexto';

/** T36 (mockup t07): privacidade. Página pública, só com texto fixo; rascunho até o usuário aprovar (ACE-58, ACE-60). */
export function PaginaPrivacidade() {
  return (
    <PaginaTexto titulo="Privacidade" voltarPara="/">
      <h2 className="subtitulo">O que guardamos</h2>
      <p className="paragrafo">
        Do jogador: apelido, ano de nascimento, posição, telefone (opcional), data de entrada no grupo, presenças e as
        notas de habilidade dadas pelos admins. Dos admins: nome, e-mail, a senha guardada de um jeito que ninguém
        consegue ler, e a data em que aceitou estes termos. Do uso do app: contagens anônimas, sem nome, telefone nem
        localização.
      </p>
      <h2 className="subtitulo">E-mails</h2>
      <p className="paragrafo">
        Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin.
      </p>
      <h2 className="subtitulo">Quem vê</h2>
      <p className="paragrafo">
        Qualquer pessoa com o link do grupo vê o ranking: apelido, colocação e pontos. Telefone, idade, posição, notas,
        nível e o caixa ficam só com os admins do grupo.
      </p>
      <h2 className="subtitulo">Como excluir seus dados</h2>
      <p className="paragrafo">
        Admin: em Minha conta, use &quot;Excluir minha conta&quot;. Jogador: fale com o admin do seu grupo, que pode
        excluir ou inativar o cadastro.
      </p>
    </PaginaTexto>
  );
}
