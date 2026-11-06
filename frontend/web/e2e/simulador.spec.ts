import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';
import { URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas do simulador ponta a ponta (simulador T54; J-22 a J-24 de `.specs/projeto/jornadas.md`; SIM-47, SIM-64,
 * SIM-67, SIM-75), contra o `wrangler dev` do e2e com `EMAIL_DEV=1` (`playwright.config.ts`), no molde de
 * `e2e/partidas.spec.ts` (T79 da partidas-e-ranking).
 *
 * Cada jornada cria a própria conta, grupo e jogadores (sufixo do momento), para não depender do banco nem da ordem.
 * O grupo joga no dia da semana de hoje em São Paulo: assim o próximo dia de jogo (AD-086), a data sugerida da partida
 * e a data da escalação são o mesmo dia, e a partida pré-marcada da J-24 não cai no futuro. Os ajudantes repetem os de
 * `partidas.spec.ts`: importar um spec registraria os testes dele de novo.
 *
 * SPEC_DEVIATION: a J-22 pede "desmarcar um ausente e marcar um Só 1º"; o grupo novo não tem ausência registrada, então
 * o jogador desmarcado faz o papel do ausente.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;

const APELIDOS = [
  'Alemão',
  'Bigode',
  'Cabeça',
  'Careca',
  'Dudu',
  'Fumaça',
  'Gil',
  'Japa',
  'Léo',
  'Marcão',
  'Neném',
  'Paulinho',
  'Rato',
  'Serginho',
  'Tico',
  'Toninho',
  'Vini',
  'Xandão',
  'Zé',
  'Baixinho',
  'Cebola',
  'Dentinho',
] as const;

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

function diaDaSemanaDeHoje(): (typeof DIAS)[number] {
  return DIAS[new Date(`${hoje()}T12:00:00Z`).getUTCDay()] ?? 'quinta';
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

let ultimoIp = 160;
async function aparelho(browser: Browser): Promise<Page> {
  ultimoIp += 1;
  const contexto = await browser.newContext({
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

/** Grupo que joga no dia da semana de hoje (próximo dia de jogo = hoje). */
async function criarGrupoDeHoje(pagina: Page, nome: string): Promise<{ id: string; slug: string }> {
  const r = await pagina.request.post('/api/grupos', {
    headers: CABECALHO,
    data: { nome, diaSemana: diaDaSemanaDeHoje(), frequencia: 'semanal', horario: '20:00' },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string; slug: string };
}

async function criarJogadores(
  pagina: Page,
  grupoId: string,
  quantos: number,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const entrada = diasAntes(hoje(), 30);
  for (const apelido of APELIDOS.slice(0, quantos)) {
    const r = await pagina.request.post(`/api/grupos/${grupoId}/jogadores`, {
      headers: CABECALHO,
      data: { apelido, anoNascimento: 1990, posicao: 'meia', dataEntrada: entrada },
    });
    expect(r.status()).toBe(201);
    ids.set(apelido, ((await r.json()) as { id: string }).id);
  }
  return ids;
}

/** Cartão de um time pelo título ("Time A", "Time B"); o título pode trazer um selo depois do nome. */
function cartao(pagina: Page, nome: string) {
  return pagina.getByRole('region', { name: new RegExp(`^${nome}\\b`) });
}

/** Apelidos de um cartão de time, na ordem da tela (o selo "movido" fica de fora). */
async function apelidosDoTime(pagina: Page, nome: string): Promise<string[]> {
  const botoes = cartao(pagina, nome).getByRole('button');
  const textos = await botoes.evaluateAll((els) =>
    els.map((e) => e.querySelector('span')?.textContent ?? e.textContent ?? ''),
  );
  return textos.map((t) => t.trim());
}

/** Monta, ajusta e confirma a escalação de 2 times da J-22 (passos 1 a 4 e o Resultado esperado dela). */
async function jornadaDoisTimes(pagina: Page, grupoId: string): Promise<void> {
  const dataHoje = hoje();

  // 1. no início, o item "Simulador: <dia>, dd/mm" do próximo dia de jogo (SIM-08, SIM-84).
  await pagina.goto(`/app/grupos/${grupoId}`);
  const dia = pagina.getByRole('region', { name: 'Dia de jogo' });
  await expect(
    dia.getByText(`Nenhuma escalação confirmada para ${diaMes(dataHoje)}`),
  ).toBeVisible();
  await dia.getByRole('link', { name: new RegExp(`^Simulador: .+, ${diaMes(dataHoje)}$`) }).click();
  await expect(pagina).toHaveURL(new RegExp(`/app/grupos/${grupoId}/simulador$`));

  // 2. desmarcar um (o "ausente"), marcar um "Só 1º"; N = 7 e K = 2 (os iniciais, SIM-05).
  await pagina.getByRole('checkbox', { name: 'Dudu', exact: true }).uncheck();
  // O input do interruptor fica sob o trilho do label: o clique do usuário cai no label.
  await pagina
    .locator('label')
    .filter({ has: pagina.getByRole('switch', { name: 'Só 1º tempo: Gil' }) })
    .click();
  await expect(pagina.getByRole('switch', { name: 'Só 1º tempo: Gil' })).toBeChecked();
  await expect(pagina.getByRole('spinbutton', { name: 'Jogadores por time' })).toHaveValue('7');
  await expect(pagina.getByText(/^2 times de 7 · \d+ reservas?$/)).toBeVisible();

  // 3. sugerir (SIM-47) e mover um titular do Time A para o Time B (SIM-64): os números recalculam (SIM-65).
  await pagina.getByRole('button', { name: 'Sugerir times' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Times sugeridos' })).toBeVisible();
  const timeAInicial = await apelidosDoTime(pagina, 'Time A');
  const movido = timeAInicial[0] ?? '';
  expect(movido).not.toBe('');
  const avaliar = pagina.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/grupos/${grupoId}/simulador/avaliar`) &&
      r.request().method() === 'POST',
  );
  await cartao(pagina, 'Time A')
    .getByRole('button', { name: new RegExp(`^${movido}`) })
    .click();
  await pagina.getByRole('button', { name: 'Titular do Time B' }).click();
  expect((await avaliar).status()).toBe(200);
  expect(await apelidosDoTime(pagina, 'Time B')).toContain(movido);
  expect(await apelidosDoTime(pagina, 'Time A')).not.toContain(movido);

  // "Refazer" com ajuste pergunta e devolve a mesma sugestão (SIM-66, determinismo SIM-17).
  await pagina.getByRole('button', { name: 'Refazer sugestão' }).click();
  await expect(pagina.getByText('Descartar seus ajustes?')).toBeVisible();
  await pagina.getByRole('button', { name: 'Refazer sugestão' }).last().click();
  await expect(cartao(pagina, 'Time A')).toBeVisible();
  await expect.poll(() => apelidosDoTime(pagina, 'Time A')).toEqual(timeAInicial);

  // De novo o ajuste, e 4. confirmar (SIM-67).
  const avaliarDeNovo = pagina.waitForResponse(
    (r) => r.url().endsWith('/simulador/avaliar') && r.request().method() === 'POST',
  );
  await cartao(pagina, 'Time A')
    .getByRole('button', { name: new RegExp(`^${movido}`) })
    .click();
  await pagina.getByRole('button', { name: 'Titular do Time B' }).click();
  await avaliarDeNovo;
  const escalacao = pagina.waitForResponse(
    (r) => r.url().endsWith(`/api/grupos/${grupoId}/escalacoes`) && r.request().method() === 'POST',
  );
  await pagina.getByRole('button', { name: 'Confirmar escalação' }).click();
  expect((await escalacao).ok()).toBe(true);

  // Resultado: o início com a faixa e, abaixo do item Simulador, a linha da escalação (SIM-73, SIM-08).
  await expect(pagina).toHaveURL(new RegExp(`/app/grupos/${grupoId}$`));
  await expect(
    pagina.getByText(`Escalação de ${diaMes(dataHoje)} confirmada.`, { exact: true }),
  ).toBeVisible();
  await expect(
    dia.getByText(`Escalação de ${diaMes(dataHoje)} confirmada`, { exact: true }),
  ).toBeVisible();
}

test('J-22: montar os times e confirmar a escalação (2 times)', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Vinte e Dois', 'j22');
  const grupo = await criarGrupoDeHoje(pagina, `Pelada Vinte e Dois ${sufixo()}`);
  await criarJogadores(pagina, grupo.id, 17);

  await jornadaDoisTimes(pagina, grupo.id);

  // A escalação gravada é a composição ajustada: GET partidas/nova vem pré-marcado (SIM-67, SIM-75).
  const nova = (await (
    await pagina.request.get(`/api/grupos/${grupo.id}/partidas/nova?data=${hoje()}`)
  ).json()) as {
    preMarcadaPelaEscalacao: boolean;
    jogadores: Array<{ apelido: string; situacao: string }>;
  };
  expect(nova.preMarcadaPelaEscalacao).toBe(true);
  expect(nova.jogadores.find((j) => j.apelido === 'Dudu')?.situacao).toBe('ausente');
  expect(nova.jogadores.filter((j) => j.situacao === 'presente')).toHaveLength(16);
  await pagina.context().close();
});

test('J-23: dividir em 3 ou mais times', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Vinte e Três', 'j23');
  const grupo = await criarGrupoDeHoje(pagina, `Pelada Vinte e Três ${sufixo()}`);
  await criarJogadores(pagina, grupo.id, 22);

  // 1. 22 aptos, "3 ou mais times" e N = 4.
  await pagina.goto(`/app/grupos/${grupo.id}/simulador`);
  await pagina.getByRole('radio', { name: '3 ou mais times' }).check();
  await pagina.getByRole('spinbutton', { name: 'Jogadores por time' }).fill('4');
  await expect(
    pagina.getByText('5 times de 4 + 1 time incompleto de 2', { exact: true }),
  ).toBeVisible();

  // 2. sugerir (SIM-47): 6 cartões, o último "Incompleto (2 de 4)" (SIM-30, SIM-38).
  await pagina.getByRole('button', { name: 'Sugerir times' }).click();
  const cartoes = pagina.getByRole('region', { name: /^Time \d+/ });
  await expect(cartoes).toHaveCount(6);
  await expect(cartoes.last()).toContainText('Incompleto (2 de 4)');

  // 3. confirmar (SIM-67).
  const escalacao = pagina.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/grupos/${grupo.id}/escalacoes`) && r.request().method() === 'POST',
  );
  await pagina.getByRole('button', { name: 'Confirmar escalação' }).click();
  expect((await escalacao).ok()).toBe(true);
  await expect(
    pagina.getByText(`Escalação de ${diaMes(hoje())} confirmada.`, { exact: true }),
  ).toBeVisible();

  // Resultado: o painel "Uso do app" conta 1 escalação na semana (T30).
  const uso = (await (await pagina.request.get(`/api/grupos/${grupo.id}/uso`)).json()) as {
    semanas: Array<{ escalacoesConfirmadas: number }>;
  };
  expect(uso.semanas[0]?.escalacoesConfirmadas).toBe(1);
  await pagina.context().close();
});

test('J-24: lançar a partida pré-marcada pela escalação', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Vinte e Quatro', 'j24');
  const grupo = await criarGrupoDeHoje(pagina, `Pelada Vinte e Quatro ${sufixo()}`);
  await criarJogadores(pagina, grupo.id, 17);
  const dataHoje = hoje();

  // Depois da J-22.
  await jornadaDoisTimes(pagina, grupo.id);

  // 1. "Lançar partida de <dia>, dd/mm": a faixa e todos da escalação presentes (SIM-75, SIM-77).
  await pagina
    .getByRole('region', { name: 'Dia de jogo' })
    .getByRole('link', { name: /^Lançar partida de / })
    .click();
  await expect(pagina).toHaveURL(/\/partidas\/nova/);
  await expect(
    pagina.getByText(
      `Pré-marcado pela escalação de ${diaMes(dataHoje)} (inclui quem ficou como “não entra”).`,
    ),
  ).toBeVisible();
  await expect(
    pagina.getByText('Presentes 16 · Lesionados 0 · Expulsos 0 · Ausentes 1'),
  ).toBeVisible();
  const situacao = (apelido: string, nome: 'Ausente' | 'Presente') =>
    pagina
      .getByRole('group', { name: `Situação de ${apelido}` })
      .getByRole('radio', { name: nome });
  await expect(situacao('Gil', 'Presente')).toBeChecked();
  await expect(situacao('Dudu', 'Ausente')).toBeChecked();

  // 2. trocar um jogador para ausente e 3. salvar (PAR-22).
  await situacao('Gil', 'Ausente').check();
  await pagina.getByRole('button', { name: 'Salvar partida (15 presentes)' }).click();
  await expect(pagina.getByText(`Partida de ${diaMes(dataHoje)} salva.`)).toBeVisible();

  // Resultado: a partida gravada com as marcações finais, e o ranking a mostra (PAR-17).
  const ranking = (await (
    await pagina.request.get(`/api/publico/${grupo.slug}/ranking`)
  ).json()) as {
    partidas: Array<{ data: string }>;
    linhas: Array<{ apelido: string; rodadas: Array<{ situacao: string }> }>;
  };
  expect(ranking.partidas.map((p) => p.data)).toContain(dataHoje);
  const ultima = (a: string) =>
    ranking.linhas.find((l) => l.apelido === a)?.rodadas.at(-1)?.situacao;
  expect(ultima('Gil')).toBe('falta');
  expect(ultima('Alemão')).toBe('presente');
  await pagina.context().close();
});
