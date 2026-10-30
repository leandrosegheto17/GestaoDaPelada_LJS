// Critério: T53 (GEL-27, GEL-118): cada mutação chama a rota certa com o corpo do contrato e invalida `grupos` e
// `grupo`; o 422 com `campos` chega à tela no formato do `ResumoErros`.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpoEnviado, erroApi, json, simularApi } from '../../test/apoio/tela';
import { deErroApi, paraResumo } from './errosDeCampos';
import {
  chaveGrupo,
  chaveGrupos,
  useArquivarGrupo,
  useCriarGrupo,
  useEditarGrupo,
  useGrupo,
  useGrupos,
  useReativarGrupo,
} from './grupos';
import { chaveSessao } from './sessao';

afterEach(() => vi.unstubAllGlobals());

const DETALHE = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://app.invalid/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 0,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const CORPO = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' };

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const chave of [chaveGrupos, chaveGrupo('g1'), [...chaveGrupo('g1'), 'admins'], chaveSessao, chaveGrupo('g2')]) {
    cliente.setQueryData(chave, { x: 1 });
  }
  const envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  return { cliente, envolver };
}

const invalidada = (c: QueryClient, chave: readonly unknown[]) => c.getQueryState(chave)?.isInvalidated;

/** Método e caminho de uma chamada do fetch simulado. */
const chamada = (f: ReturnType<typeof simularApi>, i = 0) => {
  const [url, init] = f.mock.calls[i]!;
  return `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
};

function esperaInvalidarGrupo(cliente: QueryClient, grupoId: string) {
  return waitFor(() => {
    expect(invalidada(cliente, chaveGrupos)).toBe(true);
    expect(invalidada(cliente, chaveGrupo(grupoId))).toBe(true);
    expect(invalidada(cliente, chaveSessao)).toBe(true);
  });
}

describe('leituras de grupos', () => {
  it('useGrupos lê GET /api/grupos no formato do contrato', async () => {
    const f = simularApi(() => json({ ativos: [], arquivados: [] }));
    const { envolver } = montar();
    const { result } = renderHook(() => useGrupos(), { wrapper: envolver });
    await waitFor(() => expect(result.current.data).toEqual({ ativos: [], arquivados: [] }));
    expect(chamada(f)).toBe('GET /api/grupos');
  });

  it('useGrupo lê GET /api/grupos/:grupoId', async () => {
    const f = simularApi(() => json(DETALHE));
    const { envolver } = montar();
    const { result } = renderHook(() => useGrupo('g1'), { wrapper: envolver });
    await waitFor(() => expect(result.current.data).toEqual(DETALHE));
    expect(chamada(f)).toBe('GET /api/grupos/g1');
  });
});

describe('mutações de grupos', () => {
  it('criar: POST /api/grupos com o corpo e invalida a lista, a sessão e o grupo criado', async () => {
    const f = simularApi(() =>
      json({ id: 'g1', slug: 'pelada-de-quinta', linkPublico: 'https://app.invalid/g/x' }, 201),
    );
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useCriarGrupo(), { wrapper: envolver });
    result.current.mutate(CORPO);
    await esperaInvalidarGrupo(cliente, 'g1');
    expect(chamada(f)).toBe('POST /api/grupos');
    expect(corpoEnviado(f)).toEqual(CORPO);
    expect(result.current.data).toMatchObject({ id: 'g1' });
  });

  it('editar: PATCH /api/grupos/:grupoId com o corpo e invalida grupos, grupo (e o que mora sob ele) e sessão', async () => {
    const f = simularApi(() => json(DETALHE));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useEditarGrupo('g1'), { wrapper: envolver });
    result.current.mutate(CORPO);
    await esperaInvalidarGrupo(cliente, 'g1');
    expect(invalidada(cliente, [...chaveGrupo('g1'), 'admins'])).toBe(true);
    expect(invalidada(cliente, chaveGrupo('g2'))).toBe(false);
    expect(chamada(f)).toBe('PATCH /api/grupos/g1');
    expect(corpoEnviado(f)).toEqual(CORPO);
  });

  it('arquivar: POST …/arquivar com { nomeConfirmacao } e invalida', async () => {
    const f = simularApi(() => json(DETALHE));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useArquivarGrupo('g1'), { wrapper: envolver });
    result.current.mutate('Pelada de Quinta');
    await esperaInvalidarGrupo(cliente, 'g1');
    expect(chamada(f)).toBe('POST /api/grupos/g1/arquivar');
    expect(corpoEnviado(f)).toEqual({ nomeConfirmacao: 'Pelada de Quinta' });
  });

  it('reativar: POST …/reativar do grupo pedido, sem corpo, e invalida', async () => {
    const f = simularApi(() => json({ ...DETALHE, id: 'g2' }));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useReativarGrupo(), { wrapper: envolver });
    result.current.mutate('g2');
    await esperaInvalidarGrupo(cliente, 'g2');
    expect(chamada(f)).toBe('POST /api/grupos/g2/reativar');
    expect(corpoEnviado(f)).toBeUndefined();
  });

  it('o id do grupo vai codificado no caminho', async () => {
    const f = simularApi(() => json(DETALHE));
    const { envolver } = montar();
    const { result } = renderHook(() => useEditarGrupo('g/1'), { wrapper: envolver });
    result.current.mutate(CORPO);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(f.mock.calls[0]![0])).toContain('/api/grupos/g%2F1');
  });

  it('falha não invalida nada', async () => {
    simularApi(() => erroApi(409, 'grupo_arquivado'));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useEditarGrupo('g1'), { wrapper: envolver });
    result.current.mutate(CORPO);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidada(cliente, chaveGrupos)).toBe(false);
    expect(invalidada(cliente, chaveGrupo('g1'))).toBe(false);
  });
});

describe('422 com campos no formato do ResumoErros (GEL-118)', () => {
  const ORDEM = ['nome', 'diaSemana', 'frequencia', 'horario'];
  const ROTULOS = { nome: 'Nome', diaSemana: 'Dia', frequencia: 'Frequência', horario: 'Horário' };

  it('a mutação rejeita com os campos da API, e eles viram os itens do resumo na ordem do formulário', async () => {
    const campos = { horario: 'Horário inválido.', nome: 'O nome precisa ter de 3 a 60 caracteres.' };
    simularApi(() => erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', campos));
    const { envolver } = montar();
    const { result } = renderHook(() => useCriarGrupo(), { wrapper: envolver });
    result.current.mutate(CORPO);
    await waitFor(() => expect(result.current.isError).toBe(true));
    const erros = deErroApi(result.current.error);
    expect(erros).toEqual(campos);
    expect(paraResumo(erros!, ORDEM, ROTULOS, 'grupo-')).toEqual([
      { idCampo: 'grupo-nome', rotulo: 'Nome' },
      { idCampo: 'grupo-horario', rotulo: 'Horário' },
    ]);
  });

  it('erro que não é 422 com campos não vira resumo', () => {
    expect(deErroApi(new Error('rede'))).toBeNull();
  });
});
