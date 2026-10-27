import { PaginaTexto } from '../compartilhado/PaginaTexto';

/** T35 (mockup t33): termos de uso. Página pública, só com texto fixo; o texto é rascunho até o usuário aprovar (ACE-58, ACE-60). */
export function PaginaTermos() {
  return (
    <PaginaTexto titulo="Termos de uso" voltarPara="/cadastro">
      <h2 className="subtitulo">O serviço</h2>
      <p className="paragrafo">
        O Gestão da Pelada ajuda o organizador a controlar presença, times, ranking e caixa de um grupo de futebol entre
        amigos.
      </p>
      <h2 className="subtitulo">Sua conta</h2>
      <p className="paragrafo">
        Você é responsável pelos dados que cadastra e por manter sua senha em segredo. Os jogadores do grupo não
        precisam de conta.
      </p>
      <h2 className="subtitulo">Encerramento</h2>
      <p className="paragrafo">Você pode excluir sua conta a qualquer momento em Minha conta.</p>
    </PaginaTexto>
  );
}
