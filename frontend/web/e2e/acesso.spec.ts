import { createHash } from 'node:crypto';
import { expect, test as base, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Os quatro "Independent Test" da spec de conta e acesso (ACE-01, 06, 09, 17, 24, 33), contra o build servido pelo
// Worker local com `EMAIL_DEV=1`: os links dos e-mails vêm da caixa de desenvolvimento (`GET /api/dev/emails`).
// O seed dá ao admin `admin@exemplo.com.br` a senha de `SEED_SENHA_ADMIN` (`pnpm seed`).

const EMAIL_ADMIN = 'admin@exemplo.com.br';
const SENHA = 'Senha-E2E-12345';
const CABECALHO = { 'X-Pelada': '1' };
const BASE = 'http://127.0.0.1:8798';

/**
 * O limite de taxa das rotas sem sessão (ACE-50) usa `CF-Connecting-IP` como chave: 10 pedidos por minuto. Fora da
 * Cloudflare (Worker local) o cabeçalho é livre, então cada teste usa o próprio endereço e os fluxos não dividem a cota.
 */
function cabecalhoDeIp(titulo: string): Record<string, string> {
  const [a = 1, b = 1, c = 1] = createHash('sha256').update(titulo).digest();
  return { 'CF-Connecting-IP': `10.${a}.${b}.${c}` };
}

const test = base.extend({
  // O Playwright exige a desestruturação (vazia) no primeiro argumento de um fixture.
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use, testInfo) => {
    await use(cabecalhoDeIp(testInfo.title));
  },
});

interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
}

function senhaDoAdmin(): string {
  const senha = process.env['SEED_SENHA_ADMIN'];
  if (!senha) throw new Error('Defina SEED_SENHA_ADMIN (a mesma do `pnpm seed`) para os fluxos de acesso.');
  return senha;
}

const emailNovo = (prefixo: string) => `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com.br`;

/** O link mais recente enviado a `para` cujo caminho é `caminho`, relativo ao Worker local (o host do link é `URL_PUBLICA`). */
async function linkDoEmail(request: APIRequestContext, para: string, caminho: string): Promise<string> {
  let achado = '';
  await expect(async () => {
    const resposta = await request.get('/api/dev/emails');
    expect(resposta.status()).toBe(200);
    const { mensagens } = (await resposta.json()) as { mensagens: Mensagem[] };
    const links = mensagens
      .filter((m) => m.para === para)
      .flatMap((m) => [...m.texto.matchAll(/https?:\/\/\S+#t=[\w-]+/g)].map((r) => new URL(r[0])))
      .filter((url) => url.pathname === caminho);
    const ultimo = links.at(-1);
    expect(ultimo, `e-mail para ${para} com link ${caminho}`).toBeDefined();
    if (ultimo) achado = ultimo.pathname + ultimo.hash;
  }).toPass({ timeout: 10_000 });
  return achado;
}

/** Cria uma conta pela API, confirma pelo link da caixa de dev (sem sessão, ACE-06). */
async function criarContaConfirmada(request: APIRequestContext, prefixo: string): Promise<string> {
  const email = emailNovo(prefixo);
  const criada = await request.post('/api/conta', {
    headers: CABECALHO,
    data: { nome: `Pessoa ${prefixo}`, email, senha: SENHA, termos: true },
  });
  expect(criada.status()).toBeLessThan(300);
  const link = await linkDoEmail(request, email, '/confirmar');
  const token = new URLSearchParams(link.split('#')[1]).get('t');
  const confirmada = await request.post('/api/conta/confirmar', { headers: CABECALHO, data: { token } });
  expect(confirmada.status()).toBeLessThan(300);
  await request.post('/api/sessao/sair', { headers: CABECALHO });
  return email;
}

async function entrarPelaTela(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Seus grupos' })).toBeVisible();
}

async function sessaoEstaAberta(request: APIRequestContext): Promise<boolean> {
  return (await request.get('/api/sessao')).status() === 200;
}

async function novaPagina(browser: Browser, titulo: string): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: cabecalhoDeIp(titulo) });
  return contexto.newPage();
}

// ACE-01, ACE-06: cadastrar pela tela, abrir o link capturado, ver o aviso em /entrar e entrar com a senha.
test('cadastro: tela, link da caixa de dev e /app logado', async ({ page }) => {
  const email = emailNovo('cadastro');
  await page.goto('/cadastro');
  await page.getByLabel('Seu nome').fill('Pessoa Cadastro');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();

  const link = await linkDoEmail(page.request, email, '/confirmar');
  await page.goto(link);
  // ACE-06: confirmar não abre sessão; a pessoa cai em /entrar com o aviso e entra com a senha.
  await expect(page).toHaveURL(/\/entrar\?aviso=email-confirmado$/);
  await expect(page.getByText('E-mail confirmado. Entre com a sua senha.')).toBeVisible();
  expect(await sessaoEstaAberta(page.request)).toBe(false);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Seus grupos' })).toBeVisible();
  expect(await sessaoEstaAberta(page.request)).toBe(true);
});

// ACE-09, ACE-17: entrar com a conta do seed, ver /app, sair e conferir 401 em GET /api/sessao.
test('entrar e sair com a conta do seed', async ({ page }) => {
  await entrarPelaTela(page, EMAIL_ADMIN, senhaDoAdmin());
  await expect(page.getByText('Pelada de Quinta')).toBeVisible();
  expect(await sessaoEstaAberta(page.request)).toBe(true);

  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect((await page.request.get('/api/sessao')).status()).toBe(401);
});

// ACE-24: pedir a recuperação, usar o link capturado, entrar com a senha nova e ver a antiga recusada.
test('recuperação de senha: link, senha nova e senha antiga recusada', async ({ page, request }) => {
  const email = await criarContaConfirmada(request, 'recupera');
  const nova = 'Senha-Nova-67890';
  await page.goto('/entrar/esqueci');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se houver uma conta com esse e-mail')).toBeVisible();

  const link = await linkDoEmail(request, email, '/entrar/nova-senha');
  await page.goto(link);
  await page.getByLabel('Nova senha', { exact: true }).fill(nova);
  await page.getByLabel('Confirmar nova senha').fill(nova);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/entrar\?aviso=senha-alterada$/);
  await expect(page.getByText('Senha alterada. Entre com a nova senha.')).toBeVisible();

  const antiga = await request.post('/api/sessao/entrar', { headers: CABECALHO, data: { email, senha: SENHA } });
  expect(antiga.status()).toBe(401);
  await entrarPelaTela(page, email, nova);
});

// ACE-33: A (admin do seed) convida B pelo e-mail capturado, B aceita, os dois veem o grupo e A remove B.
test('convite entre duas contas: enviar, aceitar, ver o grupo e remover', async ({ page, request, browser }) => {
  const emailB = await criarContaConfirmada(request, 'convidada');

  await entrarPelaTela(page, EMAIL_ADMIN, senhaDoAdmin());
  await page.getByRole('link', { name: /Pelada de Quinta/ }).click();
  await expect(page.getByRole('heading', { name: 'Admins' })).toBeVisible();
  await page.getByLabel('E-mail').fill(emailB);
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText(`Convite enviado para ${emailB}`)).toBeVisible();

  const link = await linkDoEmail(request, emailB, '/convite');
  const paginaB = await novaPagina(browser, test.info().title);
  try {
    await entrarPelaTela(paginaB, emailB, SENHA);
    await paginaB.goto(link);
    await paginaB.getByRole('button', { name: 'Aceitar e abrir o grupo' }).click();
    await expect(paginaB).toHaveURL(/\/app\/grupos\/[^/]+\/admins$/);
    await paginaB.goto('/app');
    await expect(paginaB.getByText('Pelada de Quinta')).toBeVisible();

    // A vê B entre os admins e remove.
    await page.reload();
    const linhaB = page.getByRole('listitem').filter({ hasText: emailB });
    await expect(linhaB).toBeVisible();
    await linhaB.getByRole('button', { name: /Remover/ }).click();
    await page.getByRole('button', { name: 'Remover do grupo' }).click();
    await expect(page.getByText(emailB)).toHaveCount(0);

    // B perde o grupo na hora.
    await paginaB.reload();
    await expect(paginaB.getByText('Pelada de Quinta')).toHaveCount(0);
  } finally {
    await paginaB.context().close();
  }
});
