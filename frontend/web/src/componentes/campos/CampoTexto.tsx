import { Campo, type PropsCampo } from './Campo';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  valor: string;
  aoMudar: (valor: string) => void;
  tipo?: 'text' | 'email';
  autoComplete?: string;
  maxLength?: number;
  /** Mostra "n de máx" abaixo da entrada (usa `maxLength`). */
  contador?: boolean;
  /** Campo preenchido que a pessoa não pode mudar (ex.: e-mail do convite). */
  somenteLeitura?: boolean;
}

export function CampoTexto({
  valor,
  aoMudar,
  tipo = 'text',
  autoComplete,
  maxLength,
  contador,
  somenteLeitura,
  ...moldura
}: Props) {
  const quantos = contador && maxLength ? `${valor.length} de ${maxLength}` : null;
  const ajuda = [moldura.ajuda, quantos].filter(Boolean).join(' · ') || undefined;
  return (
    <Campo {...moldura} ajuda={ajuda}>
      {(entrada) => (
        <input
          {...entrada}
          type={tipo}
          inputMode={tipo === 'email' ? 'email' : undefined}
          autoComplete={autoComplete}
          maxLength={maxLength}
          readOnly={somenteLeitura}
          aria-readonly={somenteLeitura || undefined}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Campo>
  );
}
