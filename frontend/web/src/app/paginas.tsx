import { Casca } from '../componentes/Casca.tsx';
import { TelaMensagem } from '../componentes/TelaMensagem.tsx';

/** Página inicial provisória até as features de negócio (AD-007). */
export function EmBreve() {
  return (
    <Casca>
      <TelaMensagem titulo="Em breve" texto="O app está sendo preparado. Volte logo." />
    </Casca>
  );
}

export function NaoEncontrada() {
  return (
    <Casca>
      <TelaMensagem titulo="Página não encontrada" texto="Esse endereço não existe." />
    </Casca>
  );
}
