import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas de acesso ponta a ponta (T57; J-06 a J-09 de `.specs/projeto/jornadas.md`), contra o
 * `wrangler dev` do e2e com `EMAIL_DEV=1` e `URL_PUBLICA` local (`playwright.config.ts`): os
 * links de e-mail são lidos da caixa `GET /api/dev/emails` (T17).
 *
 * Cada jornada usa e-mails novos (sufixo do momento), para não depender do estado do banco, e
 * um `cf-connecting-ip` próprio, para a cota do `LIMITE_ENTRAR` (10 por minuto, por IP) de uma
 * não acabar com a da outra. A J-08 usa a conta do seed (`admin@exemplo.test`, senha de
 * `SEED_SENHA_ADMIN` lida do `.env` da raiz pelo `playwright.config.ts`) e o grupo dela.
 */

const SENHA = 'SenhaForte123';
const SENHA_NOVA = 'OutraSenha456';
const CONTA_SEED = 'admin@exemplo.test';

function emailNovo(prefixo: string): string {
  return `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.test`;
}

interface MensagemDev {
  tipo: string;
  para: string;
  texto: string;
}

/** Caminho com o fragmento (`/confirmar#t=...`) do último e-mail do tipo para o endereço. */
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
        const ultima = mensagens.filter((m) => m.para === para && m.tipo === tipo).at(-1);
        link = ultima?.texto.match(/https?:\/\/\S+#t=[A-Za-z0-9_%-]+/)?.[0];
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const url = new URL(link ?? '');
  return `${url.pathname}${url.hash}`;
}

let ultimoIp = 10;
async function aparelho(browser: Browser): Promise<Page> {
  ultimoIp += 1;
  const contexto = await browser.newContext({
    baseURL: URL_BASE,
    serviceWorkers: 'block',
    extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${ultimoIp}` },
  });
  return contexto.newPage();
}

async function entrar(pagina: Page, email: string, senha: string) {
  await pagina.goto('/entrar');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}

async function respostaDoLogin(pagina: Page, email: string, senha: string): Promise<number> {
  const r = await pagina.request.post('/api/sessao/entrar', {
    headers: { 'X-Pelada': '1' },
    data: { email, senha },
  });
  return r.status();
}

/** Cria uma conta pelo cadastro, confirma pelo link e devolve a página ainda sem sessão. */
async function criarContaConfirmada(pagina: Page, nome: string, email: string) {
  await pagina.goto('/cadastro');
  await pagina.getByLabel('Seu nome').fill(nome);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA);
  await pagina.getByRole('checkbox').check();
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await expect(pagina.getByText('Enviamos um link de confirmação para o seu e-mail')).toBeVisible();
  await pagina.goto(await linkDoEmail(pagina.request, email, 'confirmacao'));
  await expect(pagina).toHaveURL(/\/entrar\?aviso=email-confirmado/);
}

test('J-06: cadastro, link capturado, aviso em /entrar e login até /app', async ({ browser }) => {
  const pagina = await aparelho(browser);
  const email = emailNovo('j06');
  await criarContaConfirmada(pagina, 'Jornada Seis', email);
  await expect(pagina.getByText('E-mail confirmado. Entre com a sua senha.')).toBeVisible();
  // O link confirma sem abrir sessão (ACE-06).
  expect((await pagina.request.get('/api/sessao')).status()).toBe(401);

  // E-mail com maiúsculas e espaços entra na mesma conta (ACE-05).
  await entrar(pagina, `  ${email.toUpperCase()} `, SENHA);
  await expect(pagina).toHaveURL(/\/app$/);
  await expect(pagina.getByRole('heading', { level: 2, name: 'Nenhum grupo ainda' })).toBeVisible();
  const cookies = await pagina.context().cookies();
  expect(cookies.some((c) => c.name === '__Host-sessao' && c.httpOnly && c.secure)).toBe(true);
  await pagina.context().close();
});

test('J-07: esqueci a senha, link, a senha nova entra e a antiga é recusada', async ({
  browser,
}) => {
  const pagina = await aparelho(browser);
  const email = emailNovo('j07');
  await criarContaConfirmada(pagina, 'Jornada Sete', email);

  // Sessão aberta antes da recuperação, num outro aparelho: deixa de valer (ACE-24).
  const outro = await aparelho(browser);
  await entrar(outro, email, SENHA);
  await expect(outro).toHaveURL(/\/app$/);

  await pagina.goto('/entrar/esqueci');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByRole('button', { name: 'Enviar link' }).click();
  await expect(pagina.getByText(/Se houver uma conta com esse e-mail/)).toBeVisible();

  await pagina.goto(await linkDoEmail(pagina.request, email, 'recuperacao'));
  await pagina.getByLabel('Nova senha', { exact: true }).fill(SENHA_NOVA);
  await pagina.getByLabel('Confirmar nova senha').fill(SENHA_NOVA);
  await pagina.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(pagina).toHaveURL(/\/entrar\?aviso=senha-alterada/);
  await expect(pagina.getByText('Senha alterada. Entre com a nova senha.')).toBeVisible();

  expect(await respostaDoLogin(pagina, email, SENHA)).toBe(401);
  await entrar(pagina, email, SENHA_NOVA);
  await expect(pagina).toHaveURL(/\/app$/);

  expect((await outro.request.get('/api/sessao')).status()).toBe(401);
  await outro.context().close();
  await pagina.context().close();
});

test('J-08: A convida B, B aceita, os dois veem o grupo e A remove B', async ({ browser }) => {
  const senhaSeed = process.env.SEED_SENHA_ADMIN;
  test.skip(
    !senhaSeed,
    'SEED_SENHA_ADMIN ausente no .env da raiz: a J-08 precisa da conta do seed (pnpm seed).',
  );
  const a = await aparelho(browser);
  await entrar(a, CONTA_SEED, senhaSeed ?? '');
  await expect(a).toHaveURL(/\/app$/);
  const linkGrupo = a.getByRole('link', { name: /Pelada Local/ });
  await expect(linkGrupo).toBeVisible();
  await linkGrupo.click();
  await expect(a).toHaveURL(/\/app\/grupos\/[^/]+\/admins$/);
  const rotaAdmins = new URL(a.url()).pathname;

  const emailB = emailNovo('j08');
  await a.getByLabel('E-mail').fill(emailB);
  await a.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(a.getByText(`Convite enviado para ${emailB}. Vale por 7 dias.`)).toBeVisible();
  await expect(a.getByRole('list', { name: 'Convites pendentes' }).getByText(emailB)).toBeVisible();

  const b = await aparelho(browser);
  await b.goto(await linkDoEmail(a.request, emailB, 'convite'));
  const campoEmail = b.getByLabel('E-mail');
  await expect(campoEmail).toHaveValue(emailB);
  await expect(campoEmail).toHaveAttribute('readonly', '');
  await b.getByLabel('Seu nome').fill('Jornada Oito');
  await b.getByLabel('Senha', { exact: true }).fill(SENHA);
  await b.getByRole('checkbox').check();
  await b.getByRole('button', { name: 'Criar conta e aceitar' }).click();
  await expect(b).toHaveURL(new RegExp(`${rotaAdmins}$`));

  await b.goto('/app');
  await expect(b.getByRole('link', { name: /Pelada Local/ })).toBeVisible();

  await a.reload();
  const listaAdmins = a.getByRole('list', { name: 'Admins' });
  await expect(listaAdmins.getByText('Jornada Oito')).toBeVisible();
  await a.getByRole('button', { name: 'Remover Jornada Oito' }).click();
  await a.getByRole('alertdialog').getByRole('button', { name: 'Remover do grupo' }).click();
  await expect(listaAdmins.getByText('Jornada Oito')).toHaveCount(0);

  // B perde o acesso: a lista de admins do grupo responde 404 (ACE-41).
  const idGrupo = rotaAdmins.split('/')[3] ?? '';
  expect((await b.request.get(`/api/grupos/${idGrupo}/admins`)).status()).toBe(404);
  await b.context().close();
  await a.context().close();
});

test('J-09: conta sem grupos troca a senha, exclui a conta e o login seguinte responde 401', async ({
  browser,
}) => {
  const pagina = await aparelho(browser);
  const email = emailNovo('j09');
  await criarContaConfirmada(pagina, 'Jornada Nove', email);
  await entrar(pagina, email, SENHA);
  await expect(pagina).toHaveURL(/\/app$/);

  // O outro aparelho perde a sessão com a troca; o atual continua (ACE-26).
  const outro = await aparelho(browser);
  await entrar(outro, email, SENHA);
  await expect(outro).toHaveURL(/\/app$/);

  await pagina.goto('/app/conta/senha');
  await pagina.getByLabel('Senha atual').fill(SENHA);
  await pagina.getByLabel('Nova senha', { exact: true }).fill(SENHA_NOVA);
  await pagina.getByLabel('Confirmar nova senha').fill(SENHA_NOVA);
  await pagina.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(
    pagina.getByText('Senha trocada. Outros aparelhos foram desconectados.'),
  ).toBeVisible();
  expect((await pagina.request.get('/api/sessao')).status()).toBe(200);

  // No outro aparelho, usar o app leva a /entrar com o aviso de sessão expirada (ACE-20).
  await outro.goto('/app/conta');
  await expect(outro).toHaveURL(/\/entrar\?/);
  await outro.context().close();

  await pagina.goto('/app/conta');
  await pagina.getByRole('button', { name: 'Excluir minha conta' }).click();
  const dialogo = pagina.getByRole('alertdialog', { name: 'Excluir sua conta?' });
  await dialogo.getByLabel('Senha').fill(SENHA_NOVA);
  await dialogo.getByRole('button', { name: 'Excluir conta' }).click();
  await expect(pagina).toHaveURL(/\/\?aviso=conta-excluida$/);
  await expect(pagina.getByText('Sua conta foi excluída.')).toBeVisible();

  expect(await respostaDoLogin(pagina, email, SENHA_NOVA)).toBe(401);
  await pagina.context().close();
});
