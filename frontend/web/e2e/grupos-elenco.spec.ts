import { createHash } from 'node:crypto';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

// "Independent Test" de grupos-e-elenco (GEL-01, GEL-31, GEL-114), no celular e contra o build servido pelo Worker
// local com `EMAIL_DEV=1`: uma conta nova cria "Pelada de Quinta", cadastra "Toninho", arquiva o grupo e o reativa.

const SENHA = 'Senha-E2E-12345';
const CABECALHO = { 'X-Pelada': '1' };
const LIMITE_MS = 120_000;

/** Cada teste usa o próprio IP no limite de taxa das rotas sem sessão (ver `acesso.spec.ts`). */
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

test.use({ viewport: { width: 390, height: 844 } });

interface Mensagem {
  para: string;
  texto: string;
}

async function linkDoEmail(request: APIRequestContext, para: string, caminho: string): Promise<string> {
  let achado = '';
  await expect(async () => {
    const resposta = await request.get('/api/dev/emails');
    expect(resposta.status()).toBe(200);
    const { mensagens } = (await resposta.json()) as { mensagens: Mensagem[] };
    const ultimo = mensagens
      .filter((m) => m.para === para)
      .flatMap((m) => [...m.texto.matchAll(/https?:\/\/\S+#t=[\w-]+/g)].map((r) => new URL(r[0])))
      .filter((url) => url.pathname === caminho)
      .at(-1);
    expect(ultimo, `e-mail para ${para} com link ${caminho}`).toBeDefined();
    if (ultimo) achado = ultimo.pathname + ultimo.hash;
  }).toPass({ timeout: 10_000 });
  return achado;
}

/** Conta nova e confirmada, sem grupos (ACE-06). */
async function criarContaSemGrupos(request: APIRequestContext): Promise<string> {
  const email = `grupos-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com.br`;
  const criada = await request.post('/api/conta', {
    headers: CABECALHO,
    data: { nome: 'Pessoa Grupos', email, senha: SENHA, termos: true },
  });
  expect(criada.status()).toBeLessThan(300);
  const link = await linkDoEmail(request, email, '/confirmar');
  const token = new URLSearchParams(link.split('#')[1]).get('t');
  const confirmada = await request.post('/api/conta/confirmar', { headers: CABECALHO, data: { token } });
  expect(confirmada.status()).toBeLessThan(300);
  await request.post('/api/sessao/sair', { headers: CABECALHO });
  return email;
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seus grupos' })).toBeVisible();
}

test('conta nova cria o grupo, cadastra o primeiro jogador, arquiva e reativa', async ({ page, request }) => {
  test.setTimeout(LIMITE_MS + 60_000);
  const email = await criarContaSemGrupos(request);
  await entrar(page, email);
  const inicio = Date.now();

  // GEL-01: sem grupos, o estado vazio leva a "Criar grupo".
  await expect(page.getByRole('heading', { name: 'Nenhum grupo ainda' })).toBeVisible();
  await page.getByRole('link', { name: 'Criar grupo' }).first().click();
  await page.getByLabel('Nome').fill('Pelada de Quinta');
  await page.getByLabel('Dia da semana').selectOption('quinta');
  await page.getByLabel('Horário').fill('20:00');
  await page.getByRole('button', { name: 'Criar grupo' }).click();

  // O início do novo grupo: 6 habilidades e 1 admin (GEL-114), ainda sem jogadores.
  await expect(page).toHaveURL(/\/app\/grupos\/(?!novo$)[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Início do admin: Pelada de Quinta', level: 1 })).toBeAttached();
  await expect(page.getByText('6 habilidades')).toBeVisible();
  await expect(page.getByText('1 admin', { exact: true })).toBeVisible();
  const inicioDoGrupo = page.url();

  // GEL-31: o primeiro jogador.
  await page.getByRole('link', { name: 'Cadastrar jogadores' }).click();
  await page.getByLabel('Apelido').fill('Toninho');
  await page.getByLabel('Ano de nascimento').fill('1990');
  await page.getByLabel('Posição').selectOption('atacante');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('radio', { name: 'Ativos (1)' })).toBeChecked();
  await expect(page.getByRole('link', { name: /Toninho/ })).toBeVisible();

  // O início passa a contar 1 jogador ativo.
  await page.getByRole('link', { name: /Início/ }).click();
  await expect(page).toHaveURL(inicioDoGrupo);
  await expect(page.getByText('1 ativo')).toBeVisible();

  // O grupo está em "Seus grupos".
  await page.goto('/app');
  await expect(page.getByRole('link', { name: /Pelada de Quinta/ })).toBeVisible();

  // Arquivar com o nome digitado leva o grupo a "Arquivados"; Reativar o devolve.
  await page.getByRole('link', { name: /Pelada de Quinta/ }).click();
  await page.getByRole('link', { name: /Dados do grupo/ }).click();
  await page.getByRole('button', { name: 'Arquivar grupo' }).click();
  const arquivar = page.getByRole('alertdialog');
  await arquivar.getByLabel('Digite o nome do grupo para confirmar').fill('Pelada de Quinta');
  await arquivar.getByRole('button', { name: 'Arquivar grupo' }).click();
  await expect(page.getByText('Grupo arquivado.')).toBeVisible();
  const arquivados = page.getByRole('region', { name: 'Arquivados' });
  await expect(arquivados.getByText('Pelada de Quinta')).toBeVisible();

  await page.getByRole('button', { name: 'Reativar Pelada de Quinta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reativar grupo' }).click();
  await expect(page.getByText('Grupo reativado.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Pelada de Quinta/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Arquivados' })).toHaveCount(0);

  expect(Date.now() - inicio).toBeLessThan(LIMITE_MS);
});
