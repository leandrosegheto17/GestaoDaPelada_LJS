import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diaAbreviado,
  textoPartidasDoMes,
  textoPontuacao,
  textoUso,
  InicioGrupo,
  TEXTO_SEM_JOGADORES,
  textoAdmins,
  textoHabilidades,
  textoJogadores,
  textoItemSimulador,
  textoStatusEscalacao,
} from '../../src/telas/grupo/InicioGrupo.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Início do grupo (T60; GEL-20, GEL-114), de `t09-inicio--sucesso.html` e `t09-inicio--sem-jogadores.html` do
 * mockup do módulo. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId', element: <InicioGrupo /> },
  { path: '*', element: <p>destino</p> },
];

const QUINTA = {
  id: 'g-quinta',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 1,
  souCriador: true,
  // Campos do início (PAR-132) e do simulador (SIM-08) da forma do GET (partidas-e-ranking T64): só preparação.
  dataSugeridaPartida: '2026-10-22',
  partidaNaDataSugerida: false,
  partidasNoMes: 3,
  pesosVigentesDesde: '2026-09-01',
  pesosPadrao: false,
  aparelhosNaSemana: 12,
  proximoDiaDeJogo: '2026-10-22',
  escalacaoNoProximoDia: false,
};

function abrir(api: Record<string, Manipulador>, caminho = '/app/grupos/g-quinta') {
  return abrirTela(caminho, { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

// O item Partidas mostra o mês de hoje em São Paulo (PAR-134): o relógio fica em 22/10/2026, só o `Date`.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T15:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('textos das contagens', () => {
  it('singular, plural e zero', () => {
    expect(textoJogadores(20)).toBe('20 ativos');
    expect(textoJogadores(1)).toBe('1 ativo');
    expect(textoJogadores(0)).toBe('Nenhum cadastrado');
    expect(textoHabilidades(6)).toBe('6 habilidades');
    expect(textoHabilidades(1)).toBe('1 habilidade');
    expect(textoHabilidades(0)).toBe('Nenhuma habilidade');
    expect(textoAdmins(1)).toBe('1 admin');
    expect(textoAdmins(2)).toBe('2 admins');
  });
});

describe('tela Início do grupo (t09)', () => {
  it('GEL-20, PAR-134 a PAR-136: mostra o nome e os 7 itens do mockup do GET /api/grupos/:grupoId; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Início do admin: Pelada de Quinta' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trocar grupo' }).getAttribute('href')).toBe('/app');

    const lista = screen.getByRole('list', { name: 'Gerenciar' });
    const itens = within(lista).getAllByRole('link');
    // partidas-e-ranking T64 (P19, autorização de 2026-11-04 no STATE.md): a lista passa aos 7 itens do mockup do
    // módulo; os 4 de antes continuam, com o mesmo texto e o mesmo destino.
    expect(itens.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Partidas3 em outubro', '/app/grupos/g-quinta/partidas'],
      ['Jogadores20 ativos', '/app/grupos/g-quinta/jogadores'],
      ['Habilidades6 habilidades', '/app/grupos/g-quinta/habilidades'],
      ['PontuaçãoVigente desde 01/09/2026', '/app/grupos/g-quinta/pontuacao'],
      ['Admins1 admin', '/app/grupos/g-quinta/admins'],
      ['Dados do grupoToda quinta · 20:00 · link do ranking', '/app/grupos/g-quinta/dados'],
      ['Uso do appEsta semana: 12 aparelhos', '/app/grupos/g-quinta/uso'],
    ]);
    expect(screen.queryByText(TEXTO_SEM_JOGADORES)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-20: as contagens seguem a resposta (outros números)', async () => {
    abrir({
      'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, jogadoresAtivos: 1, habilidades: 2, admins: 3 }),
    });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByText('1 ativo')).toBeTruthy();
    expect(within(lista).getByText('2 habilidades')).toBeTruthy();
    expect(within(lista).getByText('3 admins')).toBeTruthy();
  });

  it('GEL-114: sem jogadores, o Dia de jogo pede o cadastro; axe sem violação', async () => {
    const { container } = abrir({
      'GET /api/grupos/g-domingo': () =>
        json(200, {
          ...QUINTA,
          id: 'g-domingo',
          nome: 'Racha de Domingo',
          diaSemana: 'domingo',
          frequencia: 'quinzenal',
          horario: '09:00',
          jogadoresAtivos: 0,
          admins: 2,
        }),
    }, '/app/grupos/g-domingo');
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByText(TEXTO_SEM_JOGADORES)).toBeTruthy();
    expect(within(dia).getByRole('link', { name: 'Cadastrar jogadores' }).getAttribute('href')).toBe(
      '/app/grupos/g-domingo/jogadores/novo',
    );
    const lista = screen.getByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByText('Nenhum cadastrado')).toBeTruthy();
    expect(within(lista).getByText('Domingo, quinzenal · 09:00 · link do ranking')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: carregando e erro com "Tentar de novo"; axe sem violação', async () => {
    const carregando = abrir({ 'GET /api/grupos/g-quinta': () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    await esperarSemViolacoes(carregando.container);
    cleanup();

    let falhar = true;
    const { container } = abrir({
      'GET /api/grupos/g-quinta': () => (falhar ? erroApi(503, 'email_indisponivel') : json(200, QUINTA)),
    });
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    await esperarSemViolacoes(container);
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('list', { name: 'Gerenciar' })).toBeTruthy();
  });

  it('GEL-21: grupo sem vínculo (404) mostra "Grupo não encontrado."', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => erroApi(404, 'nao_encontrado') });
    expect(await screen.findByText('Grupo não encontrado.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Gerenciar' })).toBeNull();
  });
});

describe('início do grupo com partidas (partidas-e-ranking T64)', () => {
  it('textos: dia abreviado, partidas do mês, pontuação e uso', () => {
    expect(diaAbreviado('2026-10-15')).toBe('qui, 15/10');
    expect(diaAbreviado('2026-10-18')).toBe('dom, 18/10');
    expect(diaAbreviado('2026-10-17')).toBe('sáb, 17/10');
    expect(textoPartidasDoMes(3, '2026-10')).toBe('3 em outubro');
    expect(textoPartidasDoMes(0, '2026-10')).toBe('Nenhuma em outubro');
    expect(textoPontuacao({ pesosPadrao: true, pesosVigentesDesde: '2026-01-01' })).toBe('Pesos padrão');
    expect(textoPontuacao({ pesosPadrao: false, pesosVigentesDesde: '2026-09-01' })).toBe('Vigente desde 01/09/2026');
    expect(textoUso(12)).toBe('Esta semana: 12 aparelhos');
  });

  it('PAR-133: sem partida na data sugerida, "Lançar partida de qui, 22/10" abre o lançamento', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    const botao = within(dia).getByRole('link', { name: 'Lançar partida de qui, 22/10' });
    expect(botao.getAttribute('href')).toBe('/app/grupos/g-quinta/partidas/nova');
  });

  it('PAR-133: com partida na data sugerida, o botão diz "Editar partida de qui, 15/10" e abre /partidas/2026-10-15', async () => {
    abrir({
      'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, dataSugeridaPartida: '2026-10-15', partidaNaDataSugerida: true }),
    });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    const botao = within(dia).getByRole('link', { name: 'Editar partida de qui, 15/10' });
    expect(botao.getAttribute('href')).toBe('/app/grupos/g-quinta/partidas/2026-10-15');
    expect(within(dia).queryByRole('link', { name: /Lançar partida/ })).toBeNull();
  });

  it('PAR-134: sem partidas no mês, "Nenhuma em outubro"', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, partidasNoMes: 0 }) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByRole('link', { name: /Partidas/ }).textContent).toBe('PartidasNenhuma em outubro');
  });

  it('PAR-135: pesos padrão mostra "Pesos padrão"', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, pesosPadrao: true }) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByRole('link', { name: /Pontuação/ }).textContent).toBe('PontuaçãoPesos padrão');
  });

  it('PAR-136: 1 aparelho mostra "Esta semana: 1 aparelho"; 0 mostra "Sem uso registrado"', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, aparelhosNaSemana: 1 }) });
    let lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByRole('link', { name: /Uso do app/ }).textContent).toBe('Uso do appEsta semana: 1 aparelho');
    cleanup();

    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, aparelhosNaSemana: 0 }) });
    lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByRole('link', { name: /Uso do app/ }).textContent).toBe('Uso do appSem uso registrado');
  });

  // simulador T51 (autorização de 2026-11-04 no STATE.md; SIM-08 substitui a omissão da PAR-160): o item Simulador
  // passa a existir, no bloco "Dia de jogo" do mockup e não na lista "Gerenciar". A asserção do Financeiro fica igual.
  it('PAR-160, SIM-08: sem a chave do saldo, nenhum "Financeiro"; o "Simulador" fica no Dia de jogo, fora do Gerenciar', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).queryByRole('link', { name: /Simulador/ })).toBeNull();
    expect(within(lista).queryByRole('link', { name: /Financeiro/ })).toBeNull();
    const dia = screen.getByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByRole('link', { name: 'Simulador: qui, 22/10' })).toBeTruthy();
  });

  it('PAR-36, SIM-73: o aviso da escalação confirmada aparece no início', async () => {
    const t = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    await screen.findByRole('list', { name: 'Gerenciar' });
    await t.roteador.navigate('/app/grupos/g-quinta', { state: { aviso: 'Escalação de 22/10 confirmada.' } });
    expect(await screen.findByText('Escalação de 22/10 confirmada.')).toBeDefined();
  });

  it('PAR-36: o aviso da navegação aparece no início ("Partida de dd/mm salva.")', async () => {
    const t = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    await screen.findByRole('list', { name: 'Gerenciar' });
    await t.roteador.navigate('/app/grupos/g-quinta', { state: { aviso: 'Partida de 22/10 salva.' } });
    expect(await screen.findByText('Partida de 22/10 salva.')).toBeDefined();
  });
});

describe('item Simulador no início do grupo (simulador T51)', () => {
  it('textos do item e da linha da escalação', () => {
    expect(textoItemSimulador('2026-10-22')).toBe('Simulador: qui, 22/10');
    expect(textoItemSimulador('2026-10-25')).toBe('Simulador: dom, 25/10');
    expect(textoStatusEscalacao('2026-10-22', true)).toBe('Escalação de 22/10 confirmada');
    expect(textoStatusEscalacao('2026-10-22', false)).toBe('Nenhuma escalação confirmada para 22/10');
  });

  it('SIM-84: o item "Simulador: qui, 22/10" abre /app/grupos/g-quinta/simulador', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    const item = within(dia).getByRole('link', { name: 'Simulador: qui, 22/10' });
    expect(item.getAttribute('href')).toBe('/app/grupos/g-quinta/simulador');
    fireEvent.click(item);
    expect(await screen.findByText('destino')).toBeTruthy();
  });

  it('SIM-08: o item usa o próximo dia de jogo, não a data sugerida da partida', async () => {
    abrir({
      'GET /api/grupos/g-quinta': () =>
        json(200, { ...QUINTA, dataSugeridaPartida: '2026-10-15', partidaNaDataSugerida: true, proximoDiaDeJogo: '2026-10-22' }),
    });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByRole('link', { name: 'Editar partida de qui, 15/10' })).toBeTruthy();
    expect(within(dia).getByRole('link', { name: 'Simulador: qui, 22/10' })).toBeTruthy();
  });

  it('SIM-08: com escalação, "Escalação de 22/10 confirmada" abaixo do item; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, escalacaoNoProximoDia: true }) });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    const status = within(dia).getByText('Escalação de 22/10 confirmada');
    expect(within(dia).queryByText('Nenhuma escalação confirmada para 22/10')).toBeNull();
    // Ordem no documento: a linha vem depois do item (a posição na tela é do e2e `simulador-inicio.spec.ts`).
    const item = within(dia).getByRole('link', { name: 'Simulador: qui, 22/10' });
    expect(item.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('SIM-08: sem escalação, "Nenhuma escalação confirmada para 22/10"', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, escalacaoNoProximoDia: false }) });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByText('Nenhuma escalação confirmada para 22/10')).toBeTruthy();
    expect(within(dia).queryByText('Escalação de 22/10 confirmada')).toBeNull();
  });

  it('SIM-08: sem jogador ativo, o Dia de jogo pede o cadastro e não mostra o Simulador (t09-inicio--sem-jogadores)', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, jogadoresAtivos: 0 }) });
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByText(TEXTO_SEM_JOGADORES)).toBeTruthy();
    expect(within(dia).queryByRole('link', { name: /Simulador/ })).toBeNull();
  });
});
