import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';
import estilos from './EstadoVazio.module.css';

interface Props {
  icone?: NomeIcone;
  titulo: string;
  texto?: ReactNode;
  /** O texto vira `role=alert` (ex.: erro de conexão). */
  alerta?: boolean;
  acao?: ReactNode;
}

/** Tela inteira com uma única mensagem (indisponível, sem permissão, não encontrado). */
export function TelaMensagem({ icone = 'info', titulo, texto, alerta, acao }: Props) {
  return (
    <main className={estilos.mensagem}>
      <div className={estilos.icone}>
        <Icone nome={icone} tamanho={56} />
      </div>
      <h1 className={estilos.titulo}>{titulo}</h1>
      {texto ? (
        <p className={estilos.texto} role={alerta ? 'alert' : undefined}>
          {texto}
        </p>
      ) : null}
      {acao}
    </main>
  );
}
