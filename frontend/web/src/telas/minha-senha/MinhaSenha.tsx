import { senha as esquemaSenha } from '@pelada/contrato/primitivos';
import { useState, type FormEvent } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCliente } from '../../dados/ContextoCliente.tsx';
import { ERRO_SENHA, ERRO_SENHAS_DIFERENTES } from '../nova-senha/NovaSenha.tsx';
import estilos from '../acesso.module.css';

/**
 * Minha senha (`/app/conta/senha`, t25; ACE-26, ACE-27, ACE-56; rota da AD-017):
 * - senha atual, nova senha e confirmação (`#atual`, `#nova`, `#conf`, como os `passos` do
 *   `telas.json`), validadas antes de enviar como na Nova senha (T47), com o `ResumoErros`;
 * - `POST /api/conta/senha` com `{ senhaAtual, senhaNova }`; 204 mostra "Senha trocada. Outros
 *   aparelhos foram desconectados." e limpa os campos (`t25-senha--sucesso`, ACE-26);
 * - 401 `senha_atual_incorreta` marca o campo da senha atual com "Senha atual incorreta."
 *   (`t25-senha--erro`, ACE-27); 429 e rede vão numa faixa de erro.
 *
 * SPEC_DEVIATION: a T52 cita o `CampoSenha` (T39), mas o mockup t25 não tem o botão "Mostrar"
 * (e a comparação visual da T56 o exige igual): os três campos usam o `Campo` com
 * `type="password"`, como a Nova senha (T47).
 */

export const TEXTO_SENHA_TROCADA = 'Senha trocada. Outros aparelhos foram desconectados.';
export const ERRO_SENHA_ATUAL = 'Senha atual incorreta.';
export const ERRO_SENHA_ATUAL_VAZIA = 'Digite sua senha atual.';

type CampoTroca = 'atual' | 'nova' | 'conf';
const ROTULOS: Readonly<Record<CampoTroca, string>> = {
  atual: 'Senha atual',
  nova: 'Nova senha',
  conf: 'Confirmar nova senha',
};

export function MinhaSenha() {
  const api = useCliente();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [erros, setErros] = useState<Partial<Record<CampoTroca, string>>>({});
  const [resumo, setResumo] = useState<CampoTroca[]>([]);
  const [falha, setFalha] = useState<string | null>(null);
  const [trocada, setTrocada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function trocar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setFalha(null);
    setTrocada(false);
    const encontrados: Partial<Record<CampoTroca, string>> = {};
    if (atual.length === 0) encontrados.atual = ERRO_SENHA_ATUAL_VAZIA;
    if (!esquemaSenha.safeParse(nova).success) encontrados.nova = ERRO_SENHA;
    if (conf !== nova) encontrados.conf = ERRO_SENHAS_DIFERENTES;
    setErros(encontrados);
    setResumo((['atual', 'nova', 'conf'] as const).filter((c) => encontrados[c]));
    if (Object.keys(encontrados).length > 0) return;
    setEnviando(true);
    try {
      await api.post('/api/conta/senha', { senhaAtual: atual, senhaNova: nova });
      setAtual('');
      setNova('');
      setConf('');
      setTrocada(true);
    } catch (erro) {
      // O erro da API marca só o campo, sem o resumo (`t25-senha--erro`).
      if (erro instanceof ErroApi && erro.codigo === 'senha_atual_incorreta')
        setErros({ atual: ERRO_SENHA_ATUAL });
      else if (erro instanceof ErroApi && erro.campos.includes('senhaNova'))
        setErros({ nova: ERRO_SENHA });
      else setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Casca grupo={{ nome: NOME_DO_APP }} estreita>
      <LinkVoltar para="/app">Início</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Minha senha</h1>
      {trocada ? <Faixa tipo="sucesso">{TEXTO_SENHA_TROCADA}</Faixa> : null}
      <form
        className={estilos.formulario}
        noValidate
        aria-busy={enviando || undefined}
        onSubmit={trocar}
      >
        <ResumoErros erros={resumo.map((c) => ({ id: c, rotulo: ROTULOS[c] }))} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <Campo
          id="atual"
          rotulo={ROTULOS.atual}
          type="password"
          autoComplete="current-password"
          erro={erros.atual}
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
        <Campo
          id="nova"
          rotulo={ROTULOS.nova}
          type="password"
          autoComplete="new-password"
          ajuda="De 8 a 72 caracteres."
          erro={erros.nova}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
        <Campo
          id="conf"
          rotulo={ROTULOS.conf}
          type="password"
          autoComplete="new-password"
          erro={erros.conf}
          value={conf}
          onChange={(e) => setConf(e.target.value)}
        />
        <div>
          <Botao type="submit" bloco carregando={enviando}>
            {enviando ? 'Trocando…' : 'Trocar senha'}
          </Botao>
        </div>
      </form>
    </Casca>
  );
}
