import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas do financeiro ponta a ponta (financeiro T48; J-25 e J-26 de `.specs/projeto/jornadas.md`), contra o
 * `wrangler dev` do e2e com `EMAIL_DEV=1` (`playwright.config.ts`). O link de convite da J-26 vem da caixa
 * `GET /api/dev/emails` (CA T17), como na J-14 (`e2e/elenco.spec.ts`).
 *
 * SPEC_DEVIATION: a T48 pede o `wrangler dev` "com o seed"; como em `elenco.spec.ts`, cada jornada cria as próprias
 * contas, o próprio grupo e os próprios jogadores, porque a J-25 configura o caixa e a J-26 concede o acesso: sobre o
 * grupo do seed (`pelada-de-quinta`, T47), a segunda rodada já encontraria o caixa configurado e o convidado com
 * acesso. O seed fica para a comparação visual e o uso manual. Os ajudantes repetem os de `elenco.spec.ts`: importar
 * um spec registraria os testes dele de novo.
 *
 * As datas e o mês são os de hoje em São Paulo (FIN-49): a entrada da mensalidade nasce com a data de hoje da API.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };
const MENOS = '−';

function sufixo(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
}

function emailNovo(prefixo: string): string {
  return `${prefixo}-${sufixo()}@exemplo.test`;
}

/** Hoje em São Paulo, `aaaa-mm-dd`. */
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** `aaaa-mm-dd` → `mm/aaaa`, como na descrição da mensalidade (FIN-16). */
function mesAno(iso: string): string {
  const [a, m] = iso.split('-');
  return `${m}/${a}`;
}

/** `aaaa-mm-dd` → `dd/mm`, como no item do lançamento. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
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

let ultimoIp = 120;
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

/** Conta nova pelo cadastro, confirmada pelo link e com a sessão aberta em `/app`. */
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
): Promise<string> {
  const r = await pagina.request.post(`/api/grupos/${grupoId}/jogadores`, {
    headers: CABECALHO,
    data: { apelido, anoNascimento: 1990, posicao: 'meia' },
  });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

function respostaDe(pagina: Page, metodo: string, trecho: string) {
  return pagina.waitForResponse((r) => r.request().method() === metodo && r.url().includes(trecho));
}

test('J-25: caixa do mês da pelada: configurar, marcar, lançar a saída e desmarcar', async ({
  browser,
}) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Organizadora Vinte e Cinco', 'j25');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Vinte e Cinco ${sufixo()}`);
  // Dois ativos no mês (entram hoje): "Não pagaram" conta só eles (FIN-11).
  await criarJogadorPelaApi(pagina, grupo.id, 'Toninho');
  await criarJogadorPelaApi(pagina, grupo.id, 'Bigode');
  const dataHoje = hoje();
  const descricaoMensalidade = `Mensalidade Toninho ${mesAno(dataHoje)}`;
  const inicio = `/app/grupos/${grupo.id}`;

  // Passo 1 (FIN-34, FIN-08): o cartão do início leva ao Financeiro, ainda sem caixa.
  await pagina.goto(inicio);
  const gerenciar = pagina.getByRole('list', { name: 'Gerenciar' });
  await expect(gerenciar.getByRole('link', { name: /Financeiro/ })).toContainText(
    'Caixa não configurado',
  );
  await gerenciar.getByRole('link', { name: /Financeiro/ }).click();
  await expect(pagina).toHaveURL(new RegExp(`${inicio}/financeiro$`));
  await expect(pagina.getByRole('heading', { name: 'Caixa não configurado' })).toBeVisible();
  await pagina.getByRole('link', { name: 'Configurar caixa' }).click();
  await expect(pagina).toHaveURL(/\/financeiro\/config$/);

  // Passo 2 (FIN-01): mensalidade R$ 75,00, saldo inicial R$ 350,00 e a data de hoje.
  await pagina.getByLabel('Mensalidade (opcional, R$)').fill('75,00');
  await pagina.getByLabel('Saldo inicial (R$)').fill('350,00');
  await pagina.getByLabel('Data do saldo inicial').fill(dataHoje);
  const salvou = respostaDe(pagina, 'PUT', '/financeiro/config');
  await pagina.getByRole('button', { name: 'Salvar' }).click();
  expect((await salvou).status()).toBe(200);
  await expect(pagina).toHaveURL(new RegExp(`${inicio}/financeiro$`));

  const saldo = pagina.getByRole('region', { name: 'Saldo atual' });
  await expect(saldo).toContainText('R$ 350,00');
  await expect(saldo).toContainText('2 jogadores');
  await expect(pagina.getByRole('heading', { name: 'Pagamentos do mês · R$ 75,00' })).toBeVisible();

  // Passo 3 (FIN-16, FIN-10, FIN-15): marcar Toninho cria a entrada de R$ 75,00 com a data de hoje; o saldo sobe.
  const marcou = respostaDe(pagina, 'POST', '/financeiro/pagamentos');
  await pagina.getByRole('switch', { name: 'Pagou: Toninho' }).click();
  expect((await marcou).status()).toBe(204);
  await expect(pagina.getByRole('switch', { name: 'Pagou: Toninho' })).toBeChecked();
  await expect(saldo).toContainText('R$ 425,00');
  await expect(saldo).toContainText('1 jogador');
  await expect(pagina.getByRole('switch', { name: 'Pagou: Bigode' })).not.toBeChecked();

  const linhaMensalidades = pagina.getByRole('button', {
    name: new RegExp(`1 mensalidade de ${mesAno(dataHoje)}`),
  });
  await linhaMensalidades.click();
  const mensalidades = pagina.getByRole('list', { name: `1 mensalidade de ${mesAno(dataHoje)}` });
  const entrada = mensalidades.getByRole('listitem').filter({ hasText: descricaoMensalidade });
  await expect(entrada).toContainText(`${diaMes(dataHoje)} · `);
  await expect(entrada).toContainText('Entrada');
  await expect(entrada).toContainText('R$ 75,00');

  // Passo 4 (FIN-25): a saída "Aluguel da quadra outubro" de R$ 800,00 reduz o saldo em R$ 800,00.
  await pagina.getByRole('link', { name: 'Novo lançamento' }).click();
  await expect(pagina).toHaveURL(/\/financeiro\/lancamentos\/novo$/);
  await expect(pagina.getByLabel('Data')).toHaveValue(dataHoje);
  await pagina.getByRole('radio', { name: 'Saída' }).check();
  await pagina.getByLabel('Descrição').fill('Aluguel da quadra outubro');
  await pagina.getByLabel('Valor (R$)').fill('800,00');
  const lancou = respostaDe(pagina, 'POST', '/financeiro/lancamentos');
  await pagina.getByRole('button', { name: 'Salvar' }).click();
  expect((await lancou).status()).toBe(201);
  await expect(pagina).toHaveURL(new RegExp(`${inicio}/financeiro$`));
  await expect(saldo).toContainText(`${MENOS} R$ 375,00`);
  await expect(saldo).toContainText('R$ 800,00');
  const aluguel = pagina.getByRole('listitem').filter({ hasText: 'Aluguel da quadra outubro' });
  await expect(aluguel).toContainText('Saída');
  await expect(aluguel).toContainText(`${MENOS} R$ 800,00`);

  // Passo 5 (FIN-22, FIN-24): desmarcar pede confirmação, remove a entrada e o saldo volta.
  await pagina.getByRole('switch', { name: 'Pagou: Toninho' }).click();
  const confirmar = pagina.getByRole('alertdialog', { name: 'Desmarcar o pagamento de Toninho?' });
  await expect(confirmar).toContainText(
    `A entrada “${descricaoMensalidade}” (R$ 75,00) será removida do caixa.`,
  );
  const desmarcou = respostaDe(pagina, 'DELETE', '/financeiro/pagamentos/');
  await confirmar.getByRole('button', { name: 'Desmarcar' }).click();
  expect((await desmarcou).status()).toBe(204);
  await expect(pagina.getByRole('switch', { name: 'Pagou: Toninho' })).not.toBeChecked();
  await expect(saldo).toContainText(`${MENOS} R$ 450,00`);
  await expect(saldo).toContainText('2 jogadores');
  await expect(pagina.getByText(descricaoMensalidade)).toHaveCount(0);
  await expect(pagina.getByRole('button', { name: /mensalidades? de/ })).toHaveCount(0);

  // O cartão do início mostra o saldo atual (FIN-34).
  await pagina.goto(inicio);
  await expect(gerenciar.getByRole('link', { name: /Financeiro/ })).toContainText(
    `Saldo ${MENOS} R$ 450,00`,
  );
  await pagina.context().close();
});

test('J-26: permissão do financeiro: convidado sem acesso, concessão pela criadora e a própria conta travada', async ({
  browser,
}) => {
  // C cria o grupo, configura o caixa e convida O pela tela de admins (como a J-14).
  const c = await aparelho(browser);
  await contaNova(c, 'Criadora Vinte e Seis', 'j26c');
  const grupo = await criarGrupoPelaApi(c, `Pelada Vinte e Seis ${sufixo()}`);
  const config = await c.request.put(`/api/grupos/${grupo.id}/financeiro/config`, {
    headers: CABECALHO,
    data: { mensalidadeCentavos: 7500, saldoInicialCentavos: 35000, dataSaldoInicial: hoje() },
  });
  expect(config.status()).toBe(200);

  await c.goto(`/app/grupos/${grupo.id}/admins`);
  const emailO = emailNovo('j26o');
  await c.getByLabel('E-mail').fill(emailO);
  await c.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(c.getByText(`Convite enviado para ${emailO}. Vale por 7 dias.`)).toBeVisible();

  const o = await aparelho(browser);
  await o.goto(await linkDoEmail(c.request, emailO, 'convite'));
  await o.getByLabel('Seu nome').fill('Convidado Vinte e Seis');
  await o.getByLabel('Senha', { exact: true }).fill(SENHA);
  await o.getByRole('checkbox').check();
  await o.getByRole('button', { name: 'Criar conta e aceitar' }).click();
  await expect(o).toHaveURL(new RegExp(`/app/grupos/${grupo.id}/admins$`));

  // Passo 1 (FIN-34, FIN-33): o início não mostra saldo e o Financeiro mostra "Sem acesso" (403).
  await o.goto(`/app/grupos/${grupo.id}`);
  const gerenciarO = o.getByRole('list', { name: 'Gerenciar' });
  await expect(gerenciarO.getByRole('link', { name: 'Admins' })).toBeVisible();
  await expect(gerenciarO.getByRole('link', { name: /Financeiro/ })).toHaveCount(0);
  const detalhe = (await (await o.request.get(`/api/grupos/${grupo.id}`)).json()) as Record<
    string,
    unknown
  >;
  expect(detalhe).not.toHaveProperty('saldoFinanceiroCentavos');

  await o.goto(`/app/grupos/${grupo.id}/financeiro`);
  await expect(o.getByText('Sem acesso', { exact: true })).toBeVisible();
  await expect(
    o.getByText('Você não tem acesso ao financeiro deste grupo. Peça a um admin com acesso.'),
  ).toBeVisible();
  const negado = await o.request.get(`/api/grupos/${grupo.id}/financeiro/mes`);
  expect(negado.status()).toBe(403);
  expect(await negado.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });

  // Passo 2 (FIN-35, FIN-51): a criadora liga "Acessa financeiro" do convidado.
  await c.goto(`/app/grupos/${grupo.id}/admins`);
  const interruptorO = c.getByRole('switch', { name: 'Acessa financeiro: Convidado Vinte e Seis' });
  await expect(interruptorO).not.toBeChecked();
  const concedeu = respostaDe(c, 'PATCH', '/financeiro');
  await interruptorO.click();
  expect((await concedeu).status()).toBe(200);
  await expect(interruptorO).toBeChecked();

  // Depois do passo 2, o convidado vê o saldo e o caixa.
  await o.goto(`/app/grupos/${grupo.id}`);
  await expect(gerenciarO.getByRole('link', { name: /Financeiro/ })).toContainText(
    'Saldo R$ 350,00',
  );
  await o.goto(`/app/grupos/${grupo.id}/financeiro`);
  await expect(o.getByRole('region', { name: 'Saldo atual' })).toContainText('R$ 350,00');
  await expect(o.getByText('Sem acesso', { exact: true })).toHaveCount(0);

  // Passo 3 (FIN-36): o próprio interruptor está desabilitado e a API responde 409 acao_na_propria_conta.
  await o.goto(`/app/grupos/${grupo.id}/admins`);
  const proprio = o.getByRole('switch', { name: 'Acessa financeiro: Convidado Vinte e Seis' });
  await expect(proprio).toBeChecked();
  await expect(proprio).toBeDisabled();
  await expect(o.getByText('Você não pode alterar o seu próprio acesso.')).toBeVisible();

  const admins = (await (await o.request.get(`/api/grupos/${grupo.id}/admins`)).json()) as {
    admins: { id: string; nome: string }[];
  };
  const idO = admins.admins.find((a) => a.nome === 'Convidado Vinte e Seis')?.id ?? '';
  expect(idO).not.toBe('');
  const recusa = await o.request.patch(`/api/grupos/${grupo.id}/admins/${idO}/financeiro`, {
    headers: CABECALHO,
    data: { acessaFinanceiro: false },
  });
  expect(recusa.status()).toBe(409);
  expect(await recusa.json()).toMatchObject({ codigo: 'acao_na_propria_conta' });
  // O acesso continua concedido.
  await o.goto(`/app/grupos/${grupo.id}/financeiro`);
  await expect(o.getByRole('region', { name: 'Saldo atual' })).toContainText('R$ 350,00');

  await o.context().close();
  await c.context().close();
});
