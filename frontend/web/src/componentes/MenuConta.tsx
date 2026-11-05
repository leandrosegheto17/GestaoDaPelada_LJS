import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSessao } from '../app/guarda.tsx';
import { useCliente } from '../dados/ContextoCliente.tsx';
import { Casca, NOME_DO_APP, type PropsCasca } from './Casca.tsx';
import estilosCasca from './Casca.module.css';
import { Dialogo } from './Dialogo.tsx';
import estilos from './MenuConta.module.css';

/**
 * Menu da conta (T50; ACE-17, ACE-56), de `t09-inicio--menu-conta.html`: o botão "Menu da
 * conta" na barra abre a folha com o nome da conta e as opções Minha conta, Privacidade,
 * Termos de uso e Sair. Sair chama `POST /api/sessao/sair`, limpa o cache de consultas (nada da
 * conta fica na memória) e vai a `/entrar`; sem resposta da API, sai do mesmo jeito (a sessão
 * vence sozinha), como o "Sair" da tela Convite (T49).
 *
 * `CascaConta` é a casca das telas da conta (`t08`, `t32`): barra do admin com o nome do app e
 * o menu à direita.
 */

export const ROTA_MINHA_CONTA = '/app/conta';

function IconeConta() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function MenuConta() {
  const api = useCliente();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const sessao = useSessao();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const nome = sessao.data?.tipo === 'ativa' ? sessao.data.sessao.nome : 'Sua conta';

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try {
      await api.post('/api/sessao/sair');
    } catch {
      // Sair sem resposta ainda leva a entrar: a sessão vence sozinha.
    }
    consultas.clear();
    void navegar('/entrar', { replace: true });
  }

  return (
    <>
      <button
        className={`${estilosCasca['botao-icone']} ${estilosCasca['botao-icone--sem-borda']}`}
        type="button"
        aria-label="Menu da conta"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
      >
        <IconeConta />
      </button>
      {aberto ? (
        <Dialogo formato="folha" titulo={nome} aoFechar={() => setAberto(false)}>
          <ul className={estilos.opcoes}>
            <li>
              <Link className={estilos.opcao} to={ROTA_MINHA_CONTA} onClick={() => setAberto(false)}>
                Minha conta
              </Link>
            </li>
            <li>
              <Link className={estilos.opcao} to="/privacidade">
                Privacidade
              </Link>
            </li>
            <li>
              <Link className={estilos.opcao} to="/termos">
                Termos de uso
              </Link>
            </li>
            <li>
              <button className={estilos.opcao} type="button" disabled={saindo} aria-busy={saindo || undefined} onClick={() => void sair()}>
                Sair
              </button>
            </li>
          </ul>
        </Dialogo>
      ) : null}
    </>
  );
}

export function CascaConta({ children, ...props }: Omit<PropsCasca, 'grupo' | 'acoes'> & { children?: ReactNode }) {
  return (
    <Casca {...props} grupo={{ nome: NOME_DO_APP }} acoes={<MenuConta />}>
      {children}
    </Casca>
  );
}
