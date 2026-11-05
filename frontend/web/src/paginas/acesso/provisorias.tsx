import { Casca } from '../../componentes/Casca.tsx';

/**
 * Telas provisórias das rotas de acesso (T42). Cada tarefa de tela (T43 a T53) troca a sua
 * entrada em `rotas.tsx` pelo componente real; a rota continua identificada por `handle.tela`,
 * que é o que o teste das rotas confere.
 */

function Pendente({ titulo }: { titulo: string }) {
  return <Casca titulo={titulo} />;
}

export const NovaSenha = () => <Pendente titulo="Nova senha" />;
export const Convite = () => <Pendente titulo="Convite" />;
export const Termos = () => <Pendente titulo="Termos de uso" />;
export const Privacidade = () => <Pendente titulo="Aviso de privacidade" />;
export const InicioApp = () => <Pendente titulo="Seus grupos" />;
export const MinhaConta = () => <Pendente titulo="Minha conta" />;
export const MinhaSenha = () => <Pendente titulo="Minha senha" />;
export const AdminsGrupo = () => <Pendente titulo="Admins do grupo" />;
