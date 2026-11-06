import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas de partidas e ranking ponta a ponta (partidas-e-ranking T79; J-15 a J-21 de `.specs/projeto/jornadas.md`;
 * PAR-03, PAR-22, PAR-46, PAR-50, PAR-84, PAR-90, PAR-95, PAR-109, PAR-155), contra o `wrangler dev` do e2e com
 * `EMAIL_DEV=1` (`playwright.config.ts`), no molde de `e2e/elenco.spec.ts`.
 *
 * Cada jornada cria as próprias contas, grupo, jogadores e partidas (sufixo do momento), para não depender do banco
 * nem da ordem; as datas são relativas ao hoje de São Paulo (as jornadas citam 08/10 e 15/10 como exemplo). Os
 * ajudantes repetem os de `elenco.spec.ts`: importar um spec registraria os testes dele de novo.
 *
 * SPEC_DEVIATION: a auditoria (`partida_editada`, `partida_excluida`, o acumulado da J-20) e a ausência de IP nos
 * eventos (J-21) não são visíveis pela tela nem pela API; ficam provadas pelos testes de repositório e de banco (T31,
 * T33, T35). A J-18 sem conexão é o `ranking-offline.spec.ts` (T78), que precisa do service worker de verdade.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };
const CAMPOS_PROIBIDOS = [
  'id',
  'jogadorId',
  'grupoId',
  'telefone',
  'anoNascimento',
  'posicaoEmCampo',
  'notas',
  'periodos',
  'pontuacaoInicial',
  'email',
];

function sufixo(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
}

function emailNovo(prefixo: string): string {
  return `${prefixo}-${sufixo()}@exemplo.test`;
}

function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function diasAntes(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** `aaaa-mm-dd` → `dd/mm`. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`. */
function naTela(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

interface MensagemDev {
  tipo: string;
  para: string;
  texto: string;
}

async function linkDoEmail(
  request: APIRequestContext,
  para: string,
  tipo: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const r = await request.get('/api/dev/emails');
        expect(r.status()).toBe(200);
        const { mensagens } = (await r.json()) as { mensagens: MensagemDev[] };
        link = mensagens
          .filter((m) => m.para === para && m.tipo === tipo)
          .at(-1)
          ?.texto.match(/https?:\/\/\S+#t=[A-Za-z0-9_%-]+/)?.[0];
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const url = new URL(link ?? '');
  return `${url.pathname}${url.hash}`;
}

let ultimoIp = 120;
async function aparelho(browser: Browser, celular = false): Promise<Page> {
  ultimoIp += 1;
  const contexto = await browser.newContext({
    ...(celular ? devices['Pixel 7'] : {}),
    baseURL: URL_BASE,
    serviceWorkers: 'block',
    extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${ultimoIp}` },
  });
  return contexto.newPage();
}

async function entrar(pagina: Page, email: string) {
  await pagina.goto('/entrar');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina).toHaveURL(/\/app$/);
}

async function contaNova(pagina: Page, nome: string, prefixo: string): Promise<string> {
  const email = emailNovo(prefixo);
  await pagina.goto('/cadastro');
  await pagina.getByLabel('Seu nome').fill(nome);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA);
  await pagina.getByRole('checkbox').check();
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await expect(pagina.getByText('Enviamos um link de confirmação para o seu e-mail')).toBeVisible();
  await pagina.goto(await linkDoEmail(pagina.request, email, 'confirmacao'));
  await expect(pagina).toHaveURL(/\/entrar\?aviso=email-confirmado/);
  await entrar(pagina, email);
  return email;
}

async function criarGrupoPelaApi(
  pagina: Page,
  nome: string,
): Promise<{ id: string; slug: string }> {
  const r = await pagina.request.post('/api/grupos', {
    headers: CABECALHO,
    data: { nome, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string; slug: string };
}

async function criarJogadorPelaApi(
  pagina: Page,
  grupoId: string,
  apelido: string,
  dataEntrada: string,
): Promise<string> {
  const r = await pagina.request.post(`/api/grupos/${grupoId}/jogadores`, {
    headers: CABECALHO,
    data: { apelido, anoNascimento: 1990, posicao: 'meia', dataEntrada },
  });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

type Situacao = 'ausente' | 'presente' | 'lesionado' | 'expulso';

async function partidaPelaApi(
  pagina: Page,
  grupoId: string,
  data: string,
  choveu: boolean,
  marcacoes: Array<[string, Situacao]>,
) {
  const r = await pagina.request.post(`/api/grupos/${grupoId}/partidas`, {
    headers: CABECALHO,
    data: {
      data,
      choveu,
      marcacoes: marcacoes.map(([jogadorId, situacao]) => ({ jogadorId, situacao })),
    },
  });
  expect(r.status()).toBe(201);
}

interface RankingJson {
  mes: string;
  partidas: Array<{ data: string; choveu: boolean }>;
  linhas: Array<{
    posicao: number;
    apelido: string;
    ptsInicial: number;
    ptsFinal: number;
    rodadas: Array<{ situacao: string; pontos: number | null }>;
  }>;
}

async function rankingPublico(
  request: APIRequestContext,
  slug: string,
  mes?: string,
): Promise<{ status: number; corpo: RankingJson; bruto: unknown }> {
  const r = await request.get(`/api/publico/${slug}/ranking${mes ? `?mes=${mes}` : ''}`);
  const bruto = (await r.json()) as unknown;
  return { status: r.status(), corpo: bruto as RankingJson, bruto };
}

/** Chaves proibidas (PAR-76) em qualquer nível do JSON público. */
function camposProibidos(valor: unknown, caminho = ''): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => camposProibidos(v, `${caminho}.${i}`));
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([k, v]) => [
    ...(CAMPOS_PROIBIDOS.includes(k) ? [`${caminho}.${k}`] : []),
    ...camposProibidos(v, `${caminho}.${k}`),
  ]);
}

function situacao(
  pagina: Page,
  apelido: string,
  nome: 'Ausente' | 'Presente' | 'Lesionado' | 'Expulso',
) {
  return pagina
    .getByRole('group', { name: `Situação de ${apelido}` })
    .getByRole('radio', { name: nome });
}

test('J-15: lançar a partida da semana e ver no ranking', async ({ browser }) => {
  const pagina = await aparelho(browser, true);
  await contaNova(pagina, 'Jornada Quinze', 'j15');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Quinze ${sufixo()}`);
  const entrada = diasAntes(hoje(), 60);
  const apelidos = ['Toninho', 'Bigode', 'Careca', 'Marcão', 'Dudu'];
  for (const a of apelidos) await criarJogadorPelaApi(pagina, grupo.id, a, entrada);

  // 1. o início sugere a partida da semana (PAR-17, PAR-133).
  await pagina.goto(`/app/grupos/${grupo.id}`);
  const lancar = pagina.getByRole('link', { name: /^Lançar partida de / });
  await expect(lancar).toBeVisible();
  await lancar.click();
  await expect(pagina).toHaveURL(/\/partidas\/nova/);

  // 2. chuva, 3 presentes, 1 expulso (PAR-22, PAR-28).
  await pagina.getByRole('switch', { name: /Choveu\?/ }).check();
  for (const a of ['Toninho', 'Bigode', 'Careca']) await situacao(pagina, a, 'Presente').check();
  await situacao(pagina, 'Marcão', 'Expulso').check();
  await pagina.getByRole('button', { name: /^Salvar partida/ }).click();
  const salva = pagina.getByText(/^Partida de \d{2}\/\d{2} salva\.$/);
  await expect(salva).toBeVisible();
  const dataSalva = ((await salva.textContent()) ?? '').match(/\d{2}\/\d{2}/)?.[0] ?? '';

  // O início passa a "Editar partida de …" (PAR-133).
  await pagina.goto(`/app/grupos/${grupo.id}`);
  await expect(pagina.getByRole('link', { name: /^Editar partida de / })).toBeVisible();

  // 3. "Ver ranking" e o ranking público numa janela sem login.
  const ver = pagina.getByRole('link', { name: 'Ver ranking' });
  await expect(ver).toHaveAttribute('href', `/g/${grupo.slug}`);
  const anonimo = await aparelho(browser, true);
  await anonimo.goto(`/g/${grupo.slug}`);
  await expect(
    anonimo.getByRole('columnheader', { name: `${dataSalva}, com chuva` }),
  ).toBeVisible();

  // Resultado: pontos pelos pesos com chuva, ordem pelo acumulado e o JSON público sem campo proibido (PAR-64, PAR-76).
  const { status, corpo, bruto } = await rankingPublico(anonimo.request, grupo.slug);
  expect(status).toBe(200);
  expect(camposProibidos(bruto)).toEqual([]);
  expect(corpo.partidas).toHaveLength(1);
  expect(corpo.partidas[0]?.choveu).toBe(true);
  const ultima = (a: string) => corpo.linhas.find((l) => l.apelido === a)?.rodadas.at(-1);
  expect(ultima('Toninho')).toEqual({ situacao: 'presente', pontos: 1 });
  expect(ultima('Marcão')).toEqual({ situacao: 'expulso', pontos: -1 });
  expect(ultima('Dudu')).toEqual({ situacao: 'falta', pontos: 0 });
  const finais = corpo.linhas.map((l) => l.ptsFinal);
  expect(finais).toEqual([...finais].sort((a, b) => b - a));
  expect(corpo.linhas.at(-1)?.apelido).toBe('Marcão');
  await pagina.context().close();
  await anonimo.context().close();
});

test('J-16: corrigir e excluir uma partida', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Dezesseis', 'j16');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Dezesseis ${sufixo()}`);
  const dataPartida = diasAntes(hoje(), 3);
  const toninho = await criarJogadorPelaApi(pagina, grupo.id, 'Toninho', diasAntes(hoje(), 30));
  const bigode = await criarJogadorPelaApi(pagina, grupo.id, 'Bigode', diasAntes(hoje(), 30));
  await partidaPelaApi(pagina, grupo.id, dataPartida, false, [
    [toninho, 'presente'],
    [bigode, 'presente'],
  ]);
  const mes = dataPartida.slice(0, 7);

  // 1 e 2. abrir a partida e trocar um presente por lesionado (PAR-46).
  await pagina.goto(`/app/grupos/${grupo.id}/partidas/${dataPartida}`);
  await expect(
    pagina.getByText(/^Última alteração: Jornada Dezesseis, \d{2}\/\d{2} \d{2}:\d{2}$/),
  ).toBeVisible();
  await situacao(pagina, 'Toninho', 'Lesionado').check();
  await pagina.getByRole('button', { name: /^Salvar partida/ }).click();
  // A edição salva volta às partidas do mês com o aviso; só então o ranking já mudou.
  await expect(pagina.getByText(`Partida de ${diaMes(dataPartida)} salva.`)).toBeVisible();
  let ranking = (await rankingPublico(pagina.request, grupo.slug, mes)).corpo;
  expect(ranking.linhas.find((l) => l.apelido === 'Toninho')?.rodadas.at(-1)?.situacao).toBe(
    'lesionado',
  );

  // 3. excluir e confirmar (PAR-50, PAR-53).
  await pagina.goto(`/app/grupos/${grupo.id}/partidas/${dataPartida}`);
  await pagina.getByRole('button', { name: 'Excluir partida' }).click();
  const dialogo = pagina.getByRole('alertdialog', {
    name: `Excluir a partida de ${diaMes(dataPartida)}?`,
  });
  await dialogo.getByRole('button', { name: 'Excluir partida' }).click();
  await expect(pagina.getByText(`Partida de ${diaMes(dataPartida)} excluída.`)).toBeVisible();

  // Resultado: a coluna some do ranking (PAR-54).
  ranking = (await rankingPublico(pagina.request, grupo.slug, mes)).corpo;
  expect(ranking.partidas.map((p) => p.data)).not.toContain(dataPartida);
  await pagina.context().close();
});

test('J-17: trocar os pesos sem mudar o passado', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Dezessete', 'j17');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Dezessete ${sufixo()}`);
  const ontem = diasAntes(hoje(), 1);
  const toninho = await criarJogadorPelaApi(pagina, grupo.id, 'Toninho', diasAntes(hoje(), 10));
  await partidaPelaApi(pagina, grupo.id, ontem, true, [[toninho, 'presente']]);

  // 1. grupo novo: "Pesos padrão" (PAR-13, PAR-135).
  await pagina.goto(`/app/grupos/${grupo.id}`);
  await expect(pagina.getByRole('list', { name: 'Gerenciar' })).toContainText('Pesos padrão');

  // 2 e 3. presença com chuva 2, salvo duas vezes no mesmo dia (PAR-03, PAR-04, PAR-11).
  for (let vez = 0; vez < 2; vez += 1) {
    await pagina.goto(`/app/grupos/${grupo.id}/pontuacao`);
    await pagina.getByLabel('Presença com chuva').fill('2');
    await pagina.getByRole('button', { name: 'Salvar nova configuração' }).click();
    await expect(pagina.getByText('Nova configuração vale a partir de hoje.')).toBeVisible();
  }
  const painel = (await (await pagina.request.get(`/api/grupos/${grupo.id}/pesos`)).json()) as {
    vigente: { vigenteDesde: string; presencaComChuva: number };
    historico: unknown[];
  };
  expect(painel.vigente.vigenteDesde).toBe(hoje());
  expect(painel.vigente.presencaComChuva).toBe(2);
  // Uma única configuração de hoje (a segunda substituiu a primeira) e no máximo a anterior no histórico.
  expect(painel.historico.length).toBeLessThanOrEqual(1);

  // 4. a partida de ontem com chuva mantém o peso antigo (PAR-09, PAR-56).
  const ranking = (await rankingPublico(pagina.request, grupo.slug, ontem.slice(0, 7))).corpo;
  expect(ranking.linhas.find((l) => l.apelido === 'Toninho')?.rodadas.at(-1)).toEqual({
    situacao: 'presente',
    pontos: 1,
  });

  // Resultado: o início mostra "Vigente desde dd/mm/aaaa".
  await pagina.goto(`/app/grupos/${grupo.id}`);
  await expect(pagina.getByRole('list', { name: 'Gerenciar' })).toContainText(
    `Vigente desde ${naTela(hoje())}`,
  );
  await pagina.context().close();
});

test('J-18: ver meses anteriores e exportar o PDF', async ({ browser }) => {
  const admin = await aparelho(browser);
  await contaNova(admin, 'Jornada Dezoito', 'j18');
  const grupo = await criarGrupoPelaApi(admin, `Pelada Dezoito ${sufixo()}`);
  const dataHoje = hoje();
  // Uma partida dois meses atrás e uma hoje: o mês do meio fica sem partidas.
  const antiga = `${diasAntes(`${dataHoje.slice(0, 7)}-01`, 40).slice(0, 7)}-05`;
  const toninho = await criarJogadorPelaApi(admin, grupo.id, 'Toninho', diasAntes(antiga, 5));
  const bigode = await criarJogadorPelaApi(admin, grupo.id, 'Bigode', diasAntes(antiga, 5));
  await partidaPelaApi(admin, grupo.id, antiga, false, [
    [toninho, 'presente'],
    [bigode, 'presente'],
  ]);
  await partidaPelaApi(admin, grupo.id, dataHoje, false, [[toninho, 'presente']]);
  const mesDoMeio = diasAntes(`${dataHoje.slice(0, 7)}-01`, 1).slice(0, 7);
  await admin.context().close();

  // 1. o jogador sem conta abre o link (PAR-84).
  const jogador = await aparelho(browser, true);
  await jogador.goto(`/g/${grupo.slug}`);
  await expect(jogador.getByRole('heading', { level: 1 })).toContainText('Pelada Dezoito');
  const ordemAtual = await jogador.getByRole('rowheader').allTextContents();

  // 2. o mês anterior não tem partidas: PTS inicial igual ao final e a mesma ordem (PAR-85, PAR-87, PAR-88, PAR-89).
  await jogador.getByRole('button', { name: /^Mês anterior/ }).click();
  await expect(jogador).toHaveURL(new RegExp(`\\?mes=${mesDoMeio}$`));
  await expect(
    jogador.getByRole('cell', { name: 'Nenhuma partida registrada neste mês' }),
  ).toBeVisible();
  expect(await jogador.getByRole('rowheader').allTextContents()).toEqual(ordemAtual);
  const doMeio = (await rankingPublico(jogador.request, grupo.slug, mesDoMeio)).corpo;
  for (const l of doMeio.linhas) expect(l.ptsInicial).toBe(l.ptsFinal);
  await jogador.getByRole('button', { name: /^Mês seguinte/ }).click();
  await expect(jogador).toHaveURL(new RegExp(`/g/${grupo.slug}\\?mes=${dataHoje.slice(0, 7)}$`));

  // 3. "Exportar PDF": no navegador sem compartilhamento, o download (PAR-95, PAR-103, PAR-106).
  const download = jogador.waitForEvent('download');
  await jogador.getByRole('button', { name: 'Exportar PDF' }).first().click();
  const baixado = await download;
  expect(baixado.suggestedFilename()).toBe(`ranking-${grupo.slug}-${dataHoje.slice(0, 7)}.pdf`);
  await expect(jogador.getByText('PDF baixado.')).toBeVisible();

  // Resultado: guardado no aparelho para abrir sem conexão (PAR-148; o offline em si é o T78).
  const chaves = await jogador.evaluate(() =>
    Object.keys(window.localStorage).filter((k) => k.startsWith('pelada:ranking:')),
  );
  expect(chaves).toContain(`pelada:ranking:${grupo.slug}:${dataHoje.slice(0, 7)}`);
  await jogador.context().close();
});

test('J-19: grupo arquivado fica indisponível e volta ao reativar', async ({ browser }) => {
  const criadora = await aparelho(browser);
  await contaNova(criadora, 'Jornada Dezenove', 'j19');
  const nome = `Pelada Dezenove ${sufixo()}`;
  const grupo = await criarGrupoPelaApi(criadora, nome);
  const jogador = await aparelho(browser, true);
  await jogador.goto(`/g/${grupo.slug}`);
  await expect(jogador.getByRole('heading', { level: 1, name: nome })).toBeVisible();

  // 1. a criadora arquiva (PAR-90).
  const arquivar = await criadora.request.post(`/api/grupos/${grupo.id}/arquivar`, {
    headers: CABECALHO,
    data: { nomeConfirmacao: nome },
  });
  expect(arquivar.ok()).toBe(true);

  // 2. o jogador abre o link e um slug que não existe: a mesma tela e o mesmo 404 (PAR-91 a PAR-94).
  await jogador.goto(`/g/${grupo.slug}`);
  await expect(
    jogador.getByRole('heading', { level: 1, name: 'Grupo indisponível' }),
  ).toBeVisible();
  const arquivado = await jogador.request.get(`/api/publico/${grupo.slug}/ranking`);
  const inexistente = await jogador.request.get('/api/publico/nao-existe/ranking');
  expect(arquivado.status()).toBe(404);
  expect(inexistente.status()).toBe(404);
  expect(await arquivado.json()).toEqual(await inexistente.json());
  await jogador.goto('/g/nao-existe');
  await expect(
    jogador.getByRole('heading', { level: 1, name: 'Grupo indisponível' }),
  ).toBeVisible();

  // 3 e 4. a criadora reativa e o ranking volta pelo mesmo slug.
  const reativar = await criadora.request.post(`/api/grupos/${grupo.id}/reativar`, {
    headers: CABECALHO,
    data: {},
  });
  expect(reativar.ok()).toBe(true);
  await jogador.goto(`/g/${grupo.slug}`);
  await expect(jogador.getByRole('heading', { level: 1, name: nome })).toBeVisible();
  expect((await jogador.request.get(`/api/publico/${grupo.slug}/ranking`)).status()).toBe(200);
  await criadora.context().close();
  await jogador.context().close();
});

test('J-20: reativar um jogador vendo o efeito nos pontos', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Vinte', 'j20');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Vinte ${sufixo()}`);
  const dataHoje = hoje();
  const gil = await criarJogadorPelaApi(pagina, grupo.id, 'Gil', diasAntes(dataHoje, 30));
  const beto = await criarJogadorPelaApi(pagina, grupo.id, 'Beto', diasAntes(dataHoje, 30));
  const ficha = `/app/grupos/${grupo.id}/jogadores/${gil}`;

  // Gil sai 15 dias atrás; duas partidas depois disso, sem ele.
  await pagina.goto(ficha);
  await pagina.getByRole('button', { name: 'Inativar', exact: true }).click();
  const inativar = pagina.getByRole('dialog', { name: 'Inativar Gil' });
  await inativar.getByLabel('Data de saída').fill(diasAntes(dataHoje, 15));
  await inativar.getByRole('button', { name: 'Inativar' }).click();
  await expect(inativar).toHaveCount(0);
  const d1 = diasAntes(dataHoje, 10);
  const d2 = diasAntes(dataHoje, 5);
  await partidaPelaApi(pagina, grupo.id, d1, false, [[beto, 'presente']]);
  await partidaPelaApi(pagina, grupo.id, d2, false, [[beto, 'presente']]);

  // 1 e 2. Reativar com retorno antes das duas partidas (PAR-109, PAR-117, PAR-159).
  const periodos = async () =>
    (await pagina.request.get(`/api/grupos/${grupo.id}/jogadores/${gil}/periodos`)).text();
  const periodosAntes = await periodos();
  await pagina.goto(ficha);
  await pagina.getByRole('button', { name: 'Reativar', exact: true }).click();
  const reativar = pagina.getByRole('dialog', { name: 'Reativar Gil' });
  await expect(reativar).toContainText(
    'Volta a aparecer no ranking e nas partidas; a data de início não muda.',
  );
  await expect(reativar).not.toContainText('os pontos não mudam');
  await reativar.getByLabel('Data de retorno').fill(diasAntes(dataHoje, 12));
  await expect(reativar).toContainText(
    `2 rodadas passam a constar: ${diaMes(d1)} e ${diaMes(d2)}.`,
  );

  // Nada muda no banco antes de confirmar (PAR-113, PAR-114).
  expect(await periodos()).toBe(periodosAntes);

  // 3. confirmar: o "Reativar" só habilita com a prévia pronta (PAR-120); a ficha mostra as rodadas (PAR-121).
  const confirmar = reativar.getByRole('button', { name: 'Reativar' });
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(pagina.getByText(/2 rodadas passaram a constar/)).toBeVisible();
  expect(await periodos()).not.toBe(periodosAntes);
  const ranking = (await rankingPublico(pagina.request, grupo.slug, d2.slice(0, 7))).corpo;
  expect(ranking.linhas.map((l) => l.apelido)).toContain('Gil');
  await pagina.context().close();
});

test('J-21: painel de uso do app', async ({ browser }) => {
  const admin = await aparelho(browser);
  await contaNova(admin, 'Jornada Vinte e Um', 'j21');
  const grupo = await criarGrupoPelaApi(admin, `Pelada Vinte e Um ${sufixo()}`);
  const toninho = await criarJogadorPelaApi(admin, grupo.id, 'Toninho', diasAntes(hoje(), 10));

  // 1. grupo novo: "Sem uso registrado" (PAR-136).
  await admin.goto(`/app/grupos/${grupo.id}`);
  await expect(admin.getByRole('list', { name: 'Gerenciar' })).toContainText('Sem uso registrado');

  // 2. o ranking público aberto num aparelho (PAR-123, PAR-124, PAR-127).
  const jogador = await aparelho(browser, true);
  const evento = jogador.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/publico/${grupo.slug}/eventos`) && r.request().method() === 'POST',
  );
  await jogador.goto(`/g/${grupo.slug}`);
  expect((await evento).status()).toBe(204);

  // 3. uma partida lançada (PAR-129).
  await partidaPelaApi(admin, grupo.id, hoje(), false, [[toninho, 'presente']]);

  // 4. "Uso do app" (PAR-144, PAR-155 a PAR-158) e o início com o aparelho da semana (PAR-132, PAR-136).
  await admin.goto(`/app/grupos/${grupo.id}`);
  await expect(admin.getByRole('list', { name: 'Gerenciar' })).toContainText(
    'Esta semana: 1 aparelho',
  );
  await admin.getByRole('link', { name: /Uso do app/ }).click();
  await expect(admin).toHaveURL(new RegExp(`/app/grupos/${grupo.id}/uso$`));
  await expect(admin.getByRole('heading', { level: 1, name: 'Uso do app' })).toBeVisible();
  await expect(admin.getByRole('main')).toContainText('1 aparelho');
  const uso = (await (await admin.request.get(`/api/grupos/${grupo.id}/uso`)).json()) as unknown;
  expect(JSON.stringify(uso)).not.toMatch(/\b(ip|email|contaId)\b/i);
  await admin.context().close();
  await jogador.context().close();
});
