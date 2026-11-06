import { expect, test, type Browser, type APIRequestContext, type Page } from '@playwright/test';
import { URL_ASAAS_FALSO, URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas de planos ponta a ponta (planos-e-cobranca T56; J-27, J-28 e J-30 de `.specs/projeto/jornadas.md`; PLA-15,
 * PLA-20, PLA-44, PLA-53, PLA-54, PLA-57), contra o `wrangler dev` do e2e com o Asaas falso (T30) e `EMAIL_DEV=1`
 * (`playwright.config.ts`), no molde de `e2e/simulador.spec.ts` e `e2e/financeiro.spec.ts`.
 *
 * Cada jornada cria a própria conta, grupo e jogadores (sufixo do momento), para não depender do banco nem da ordem. O
 * grupo novo nasce em trial (T13). O pagamento é o `POST /teste/webhook` do Asaas falso, que manda o evento ao Worker
 * com o token, como o Asaas faria. Os ajudantes repetem os de `simulador.spec.ts`: importar um spec registraria os
 * testes dele de novo.
 *
 * SPEC_DEVIATION: a tarefa pede o "relógio do servidor fixável" para levar o grupo ao Free (J-28, o 15º dia); o Worker
 * do e2e não tem relógio fixável (o `relogio` do `criarApp` só existe nos testes da API). O grupo chega ao Free pelo
 * caminho comercial: assina, o pagamento confirma (Pro) e o estorno da cobrança que deu o Pro o deixa `inadimplente`,
 * que é Free (PLA-04, PLA-47, `planoEfetivo`). O somente leitura, o inativar e a volta (PLA-15, PLA-20) são os mesmos.
 * [LACUNA] o vencimento do trial em si fica provado pelos testes do domínio e da API (T1, T24), não por este e2e.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
/** CPF válido de exemplo (dígitos verificadores corretos); o Asaas falso não o guarda. */
const CPF_TESTE = '529.982.247-25';
const TEXTO_AGUARDANDO = 'Aguardando a confirmação do pagamento';
const TEXTO_SO_A_CRIADORA = 'Só quem criou o grupo pode assinar ou cancelar';
const TITULO_SOMENTE_LEITURA = 'Este grupo passou do limite do plano Free';

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

let ultimoIp = 200;
/** Host https da fatura falsa (o banco exige https): o contexto o atende, sem rede. */
const URL_FATURA_FALSA = 'https://fatura-falsa.asaas.test';

async function aparelho(browser: Browser): Promise<Page> {
  ultimoIp += 1;
  const contexto = await browser.newContext({
    baseURL: URL_BASE,
    serviceWorkers: 'block',
    extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${ultimoIp}` },
  });
  await contexto.route(`${URL_FATURA_FALSA}/**`, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="pt-BR"><body><h1>Fatura de teste do Asaas</h1></body></html>',
    }),
  );
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

/** Grupo que joga no dia da semana de hoje (a data sugerida da partida é hoje). Nasce em trial (T13). */
async function criarGrupoDeHoje(pagina: Page, nome: string): Promise<{ id: string; slug: string }> {
  const r = await pagina.request.post('/api/grupos', {
    headers: CABECALHO,
    data: { nome, diaSemana: diaDaSemanaDeHoje(), frequencia: 'semanal', horario: '20:00' },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string; slug: string };
}

async function criarJogadores(pagina: Page, grupoId: string, quantos: number): Promise<void> {
  const entrada = diasAntes(hoje(), 30);
  for (const apelido of APELIDOS.slice(0, quantos)) {
    const r = await pagina.request.post(`/api/grupos/${grupoId}/jogadores`, {
      headers: CABECALHO,
      data: { apelido, anoNascimento: 1990, posicao: 'meia', dataEntrada: entrada },
    });
    expect(r.status()).toBe(201);
  }
}

/** A assinatura do grupo no Asaas falso (o `externalReference` da assinatura é o id do grupo, T32). */
async function assinaturaDoGrupo(request: APIRequestContext, grupoId: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const r = await request.get(`${URL_ASAAS_FALSO}/teste/estado`);
        const { assinaturas } = (await r.json()) as {
          assinaturas: { id: string; externalReference: string; deleted: boolean }[];
        };
        id = assinaturas.filter((a) => a.externalReference === grupoId && !a.deleted).at(-1)?.id;
        return id;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  return id ?? '';
}

/** O Asaas falso manda o evento da cobrança da assinatura ao webhook do Worker; o Worker responde 200. */
async function dispararEvento(
  request: APIRequestContext,
  subscription: string,
  event: string,
): Promise<void> {
  const r = await request.post(`${URL_ASAAS_FALSO}/teste/webhook`, {
    data: { event, subscription },
  });
  expect(r.status()).toBe(200);
  expect(((await r.json()) as { status: number }).status).toBe(200);
}

/** Assina pela tela de Meu plano (T45): nome, CPF e "Assinar Pro"; a fatura abre numa aba nova. */
async function assinarPelaTela(pagina: Page, grupoId: string): Promise<void> {
  await pagina.goto(`/app/grupos/${grupoId}/plano`);
  await expect(pagina.getByRole('heading', { level: 2, name: 'Trial Pro' })).toBeVisible();
  await pagina.getByLabel('Nome completo').fill('Criadora da Pelada');
  await pagina.getByLabel('CPF').fill(CPF_TESTE);
  const fatura = pagina.context().waitForEvent('page');
  await pagina.getByRole('button', { name: 'Assinar Pro' }).click();
  const aba = await fatura;
  await aba.waitForLoadState();
  expect(aba.url()).toContain(`${URL_FATURA_FALSA}/fatura/`);
  await expect(aba.getByRole('heading', { name: 'Fatura de teste do Asaas' })).toBeVisible();
  await aba.close();
}

test('J-27 (PLA-53, PLA-54, PLA-44): a criadora assina, o pagamento confirma e Meu plano mostra Pro', async ({
  browser,
}) => {
  const c = await aparelho(browser);
  await contaNova(c, 'Criadora Vinte e Sete', 'j27c');
  const grupo = await criarGrupoDeHoje(c, `Pelada Vinte e Sete ${sufixo()}`);

  // Passos 1 a 3 (PLA-53): assina com nome e CPF e a fatura abre.
  await assinarPelaTela(c, grupo.id);

  // PLA-54: reabrir Meu plano mostra o aguardando com o link da fatura.
  await c.reload();
  await expect(c.getByText(TEXTO_AGUARDANDO)).toBeVisible();
  await expect(c.getByRole('link', { name: /fatura/i })).toHaveAttribute(
    'href',
    new RegExp(`^${URL_FATURA_FALSA}/fatura/`),
  );

  // Passo 4 (PLA-44): o Asaas confirma o pagamento pelo webhook.
  const sub = await assinaturaDoGrupo(c.request, grupo.id);
  await dispararEvento(c.request, sub, 'PAYMENT_RECEIVED');

  // Passo 5: reabrir Meu plano mostra Pro com a data de `pagoAte`, sem o aguardando.
  await c.reload();
  await expect(c.getByRole('heading', { level: 2, name: 'Pro' })).toBeVisible();
  await expect(c.getByText(/^Pro até \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect(c.getByText(TEXTO_AGUARDANDO)).toHaveCount(0);

  // O CPF não fica no Asaas falso nem volta na resposta do plano.
  const estado = await (await c.request.get(`${URL_ASAAS_FALSO}/teste/estado`)).text();
  expect(estado).not.toContain('52998224725');
  const plano = await (await c.request.get(`/api/grupos/${grupo.id}/plano`)).text();
  expect(plano).not.toContain('52998224725');
});

test('J-30 (PLA-57, PLA-59): a admin convidada vê o plano sem os botões', async ({ browser }) => {
  const c = await aparelho(browser);
  await contaNova(c, 'Criadora Trinta', 'j30c');
  const grupo = await criarGrupoDeHoje(c, `Pelada Trinta ${sufixo()}`);

  await c.goto(`/app/grupos/${grupo.id}/admins`);
  const emailO = emailNovo('j30o');
  await c.getByLabel('E-mail').fill(emailO);
  await c.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(c.getByText(`Convite enviado para ${emailO}. Vale por 7 dias.`)).toBeVisible();

  const o = await aparelho(browser);
  await o.goto(await linkDoEmail(c.request, emailO, 'convite'));
  await o.getByLabel('Seu nome').fill('Convidada Trinta');
  await o.getByLabel('Senha', { exact: true }).fill(SENHA);
  await o.getByRole('checkbox').check();
  await o.getByRole('button', { name: 'Criar conta e aceitar' }).click();
  await expect(o).toHaveURL(new RegExp(`/app/grupos/${grupo.id}/admins$`));

  // PLA-59: o início do grupo mostra "Meu plano" também para a convidada, e ele abre a tela.
  await o.goto(`/app/grupos/${grupo.id}`);
  await o
    .getByRole('list', { name: 'Plano' })
    .getByRole('link', { name: /Meu plano/ })
    .click();
  await expect(o).toHaveURL(new RegExp(`/app/grupos/${grupo.id}/plano$`));

  // PLA-57: o plano aparece, com o texto e sem assinar nem cancelar.
  await expect(o.getByRole('heading', { level: 2, name: 'Trial Pro' })).toBeVisible();
  await expect(o.getByText(TEXTO_SO_A_CRIADORA)).toBeVisible();
  await expect(o.getByRole('button', { name: 'Assinar Pro' })).toHaveCount(0);
  await expect(o.getByRole('button', { name: 'Cancelar assinatura' })).toHaveCount(0);
  await expect(o.getByLabel('CPF')).toHaveCount(0);
});

test('J-28 (PLA-15, PLA-20): grupo Free com 21 fica somente leitura e volta ao inativar um', async ({
  browser,
}) => {
  const c = await aparelho(browser);
  await contaNova(c, 'Criadora Vinte e Oito', 'j28c');
  const grupo = await criarGrupoDeHoje(c, `Pelada Vinte e Oito ${sufixo()}`);
  // No trial não há limite: os 21 entram.
  await criarJogadores(c, grupo.id, 21);

  // Leva o grupo ao Free (SPEC_DEVIATION no topo): assina, paga e a cobrança que deu o Pro é estornada.
  await assinarPelaTela(c, grupo.id);
  const sub = await assinaturaDoGrupo(c.request, grupo.id);
  await dispararEvento(c.request, sub, 'PAYMENT_RECEIVED');
  await dispararEvento(c.request, sub, 'PAYMENT_REFUNDED');
  await c.goto(`/app/grupos/${grupo.id}/plano`);
  await expect(c.getByRole('heading', { level: 2, name: 'Free' })).toBeVisible();
  await expect(c.getByText('21 de 20 jogadores')).toBeVisible();

  // PLA-15, PLA-22: a faixa de somente leitura e o lançamento recusado com 403.
  await c.goto(`/app/grupos/${grupo.id}/partidas`);
  await expect(c.getByText(TITULO_SOMENTE_LEITURA)).toBeVisible();
  await expect(c.getByRole('button', { name: 'Nova partida' })).toBeDisabled();
  const recusada = await c.request.post(`/api/grupos/${grupo.id}/partidas`, {
    headers: CABECALHO,
    data: { data: hoje(), choveu: false, marcacoes: [] },
  });
  expect(recusada.status()).toBe(403);
  expect(((await recusada.json()) as { erro: string }).erro).toBe('somente_leitura');

  // O ranking público segue aberto (PLA-18).
  const publico = await c.request.get(`/api/publico/${grupo.slug}/ranking`);
  expect(publico.status()).toBe(200);

  // PLA-15: inativar um jogador continua permitido, pela ficha.
  await c.goto(`/app/grupos/${grupo.id}/jogadores`);
  await c.getByRole('link', { name: /^Cebola/ }).click();
  await expect(c.getByText(TITULO_SOMENTE_LEITURA)).toBeVisible();
  await c.getByRole('button', { name: 'Inativar' }).click();
  const dialogo = c.getByRole('dialog');
  await dialogo.getByRole('button', { name: 'Inativar' }).click();
  await expect(dialogo).toHaveCount(0);

  // PLA-20: com 20 ativos, a faixa some e a partida é lançada.
  await c.goto(`/app/grupos/${grupo.id}/partidas/nova`);
  await expect(c.getByRole('button', { name: 'Marcar todos como presentes' })).toBeEnabled();
  await expect(c.getByText(TITULO_SOMENTE_LEITURA)).toHaveCount(0);
  await c.getByRole('button', { name: 'Marcar todos como presentes' }).click();
  await c.getByRole('button', { name: /^Salvar/ }).click();
  await expect(c).toHaveURL(new RegExp(`/app/grupos/${grupo.id}$`));
  await expect(c.getByText(`Partida de ${diaMes(hoje())} salva.`)).toBeVisible();
});
