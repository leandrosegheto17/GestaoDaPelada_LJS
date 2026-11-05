import { devices, expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { URL_BASE } from '../playwright.config.ts';

/**
 * Jornadas de grupos e elenco ponta a ponta (T74; J-11 a J-14 de `.specs/projeto/jornadas.md`), contra o
 * `wrangler dev` do e2e com `EMAIL_DEV=1` e `URL_PUBLICA` = `URL_BASE` (`playwright.config.ts`). O link de convite
 * da J-14 vem da caixa `GET /api/dev/emails` (CA T17).
 *
 * Cada jornada cria as próprias contas (e-mail com sufixo do momento) e o próprio grupo, para não depender do estado
 * do banco nem da ordem; cada aparelho tem um `cf-connecting-ip` próprio, para as cotas por IP não se somarem.
 * Os ajudantes repetem os de `acesso.spec.ts` (T57): importar um spec registraria os testes dele de novo.
 *
 * SPEC_DEVIATION: a J-11 pede o slug `pelada-de-quinta`; o banco do e2e guarda os grupos das rodadas anteriores, e o
 * sufixo livre (`-2`, `-3`, GEL-14) mudaria o slug a cada rodada. O nome leva um sufixo único e o slug esperado é
 * o mesmo nome em minúsculas com hífens, exato.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };
const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'] as const;

function sufixo(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
}

function emailNovo(prefixo: string): string {
  return `${prefixo}-${sufixo()}@exemplo.test`;
}

/** Hoje em São Paulo, `aaaa-mm-dd` (o fuso do app, GEL-70). */
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function diasAntes(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`, como a tela mostra. */
function naTela(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

interface MensagemDev {
  tipo: string;
  para: string;
  texto: string;
}

async function linkDoEmail(request: APIRequestContext, para: string, tipo: string): Promise<string> {
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

let ultimoIp = 60;
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

async function criarGrupoPelaApi(pagina: Page, nome: string): Promise<{ id: string; slug: string }> {
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
  extra: Record<string, unknown> = {},
): Promise<string> {
  const r = await pagina.request.post(`/api/grupos/${grupoId}/jogadores`, {
    headers: CABECALHO,
    data: { apelido, anoNascimento: 1990, posicao: 'meia', ...extra },
  });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

async function habilidadesPelaApi(pagina: Page, grupoId: string): Promise<{ id: string; nome: string }[]> {
  const r = await pagina.request.get(`/api/grupos/${grupoId}/habilidades`);
  expect(r.status()).toBe(200);
  return ((await r.json()) as { habilidades: { id: string; nome: string }[] }).habilidades;
}

test('J-11: conta nova cria o grupo e cadastra o primeiro jogador no celular', async ({ browser }) => {
  const inicio = Date.now();
  const pagina = await aparelho(browser, true);
  await contaNova(pagina, 'Jornada Onze', 'j11');

  const marca = sufixo();
  const nome = `Pelada de Quinta ${marca}`;
  const slug = `pelada-de-quinta-${marca}`;

  await pagina.getByRole('link', { name: 'Criar grupo' }).click();
  await expect(pagina).toHaveURL(/\/app\/grupos\/novo$/);
  await pagina.getByLabel('Nome').fill(nome);
  await pagina.getByLabel('Dia da semana').selectOption('quinta');
  await pagina.getByRole('radio', { name: 'Semanal' }).check();
  await pagina.getByLabel('Horário').fill('20:00');
  await pagina.getByRole('button', { name: 'Criar grupo' }).click();

  // GEL-01: o grupo nasce com 6 habilidades (GEL-02) e a criadora como única admin.
  await expect(pagina).toHaveURL(/\/app\/grupos\/[^/]+$/);
  const grupoId = new URL(pagina.url()).pathname.split('/')[3] ?? '';
  const gerenciar = pagina.getByRole('list', { name: 'Gerenciar' });
  await expect(gerenciar).toContainText('6 habilidades');
  await expect(gerenciar).toContainText('1 admin');
  await expect(gerenciar).toContainText('Nenhum cadastrado');

  // O link público vem do slug (GEL-11, GEL-20).
  await pagina.goto(`/app/grupos/${grupoId}/dados`);
  await expect(pagina.getByText(`${URL_BASE}/g/${slug}`, { exact: true })).toBeVisible();

  // GEL-31: o primeiro jogador, sem data de entrada (vale hoje, GEL-32).
  await pagina.goto(`/app/grupos/${grupoId}/jogadores`);
  await pagina.getByRole('link', { name: 'Novo jogador' }).first().click();
  await expect(pagina).toHaveURL(/\/jogadores\/novo$/);
  await pagina.getByLabel('Apelido').fill('Toninho');
  await pagina.getByLabel('Ano de nascimento').fill('1990');
  await pagina.getByLabel('Posição').selectOption('meia');
  await pagina.getByLabel('Telefone (opcional)').fill('11987654321');
  await pagina.getByRole('button', { name: 'Salvar' }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Toninho' })).toBeVisible();
  await expect(pagina.getByText(`Ativo desde ${naTela(hoje())}.`)).toBeVisible();

  await pagina.goto(`/app/grupos/${grupoId}/jogadores`);
  await expect(pagina.getByRole('list', { name: 'Jogadores ativos' }).getByText('Toninho')).toBeVisible();

  // GEL-35: o apelido repetido sem diferença de caixa é recusado no campo (GEL-118: a posição é do erros-campo.spec).
  await pagina.goto(`/app/grupos/${grupoId}/jogadores/novo`);
  await pagina.getByLabel('Apelido').fill('toninho');
  await pagina.getByLabel('Ano de nascimento').fill('1991');
  await pagina.getByLabel('Posição').selectOption('atacante');
  await pagina.getByRole('button', { name: 'Salvar' }).click();
  await expect(pagina.getByText('Já existe um jogador com esse apelido neste grupo.').first()).toBeVisible();
  await expect(pagina.getByLabel('Apelido')).toHaveAttribute('aria-invalid', 'true');
  await expect(pagina).toHaveURL(/\/jogadores\/novo$/);

  // "tudo em menos de 2 minutos" (J-11), contado do cadastro da conta ao fim.
  expect(Date.now() - inicio).toBeLessThan(120_000);
  await pagina.context().close();
});

test('J-12: inativar, reativar e corrigir a saída de um jogador', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Doze', 'j12');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Doze ${sufixo()}`);
  const dataHoje = hoje();
  const entrada = diasAntes(dataHoje, 10);
  const betoId = await criarJogadorPelaApi(pagina, grupo.id, 'Beto', { dataEntrada: entrada });
  const ficha = `/app/grupos/${grupo.id}/jogadores/${betoId}`;
  const periodos = pagina.getByRole('list', { name: 'Períodos de atividade' });

  // GEL-51: inativar com a data de hoje.
  await pagina.goto(ficha);
  await pagina.getByRole('button', { name: 'Inativar', exact: true }).click();
  const inativar = pagina.getByRole('dialog', { name: 'Inativar Beto' });
  await expect(inativar.getByLabel('Data de saída')).toHaveValue(dataHoje);
  await inativar.getByRole('button', { name: 'Inativar' }).click();
  await expect(inativar).toHaveCount(0);
  await expect(pagina.getByText(`Inativo desde ${naTela(dataHoje)}.`)).toBeVisible();

  await pagina.goto(`/app/grupos/${grupo.id}/jogadores`);
  await pagina.getByRole('tab', { name: /Inativos/ }).click();
  await expect(pagina.getByRole('list', { name: 'Jogadores inativos' }).getByText('Beto')).toBeVisible();

  // GEL-54: reativar com a data de hoje; o início e a pontuação não mudam.
  await pagina.goto(ficha);
  await pagina.getByRole('button', { name: 'Reativar', exact: true }).click();
  const reativar = pagina.getByRole('dialog', { name: 'Reativar Beto' });
  await reativar.getByLabel('Data de retorno').fill(dataHoje);
  await reativar.getByRole('button', { name: 'Reativar' }).click();
  await expect(pagina.getByText(`Beto reativado desde ${naTela(dataHoje)}.`)).toBeVisible();
  await expect(periodos.getByRole('listitem')).toHaveCount(2);

  await pagina.goto(`/app/grupos/${grupo.id}/jogadores`);
  await expect(pagina.getByRole('list', { name: 'Jogadores ativos' }).getByText('Beto')).toBeVisible();

  // GEL-59 a GEL-61: corrigir a saída do primeiro período para um dia antes.
  await pagina.goto(ficha);
  await periodos.getByRole('listitem').first().getByRole('button', { name: 'Corrigir datas' }).click();
  const corrigir = pagina.getByRole('dialog', { name: 'Corrigir datas' });
  await corrigir.getByLabel('Data de saída').fill(diasAntes(dataHoje, 1));
  await corrigir.getByRole('button', { name: 'Confirmar novas datas' }).click();
  await expect(pagina.getByText('Datas corrigidas.')).toBeVisible();
  await expect(periodos.getByRole('listitem').first()).toContainText(naTela(diasAntes(dataHoje, 1)));

  // O passo 4 da J-12 (saída antes de uma presença) precisa de partidas, que nascem na feature 4
  // (partidas-e-ranking); a recusa pela presença é provada lá. Aqui fica a recusa pela ordem dos períodos:
  // a saída do primeiro período não pode passar do retorno seguinte.
  await periodos.getByRole('listitem').first().getByRole('button', { name: 'Corrigir datas' }).click();
  const depois = pagina.getByRole('dialog', { name: 'Corrigir datas' });
  await depois.getByLabel('Data de saída').fill(diasAntes(dataHoje, -1));
  await depois.getByRole('button', { name: 'Confirmar novas datas' }).click();
  await expect(depois).toBeVisible();
  await expect(depois.getByLabel('Data de saída')).toHaveAttribute('aria-invalid', 'true');
  await depois.getByRole('button', { name: 'Cancelar' }).click();

  // GEL-76, GEL-77: recuar a data de início; o primeiro período passa a começar nela.
  const novoInicio = diasAntes(dataHoje, 15);
  await pagina.getByRole('button', { name: 'Alterar data de início' }).click();
  const alterar = pagina.getByRole('dialog', { name: 'Alterar data de início' });
  await alterar.getByLabel('Data de início').fill(novoInicio);
  await alterar.getByRole('button', { name: 'Confirmar nova data' }).click();
  await expect(pagina.getByText(`Data de início alterada para ${naTela(novoInicio)}.`)).toBeVisible();
  await expect(periodos.getByRole('listitem').first()).toContainText(naTela(novoInicio));
  await pagina.context().close();
});

test('J-13: notas nas 6 habilidades mostram "Nível 6,8"; excluir uma habilidade recalcula', async ({ browser }) => {
  const pagina = await aparelho(browser);
  await contaNova(pagina, 'Jornada Treze', 'j13');
  const grupo = await criarGrupoPelaApi(pagina, `Pelada Treze ${sufixo()}`);
  const toninhoId = await criarJogadorPelaApi(pagina, grupo.id, 'Toninho');
  const zeId = await criarJogadorPelaApi(pagina, grupo.id, 'Zé Sem Nota', { posicao: 'goleiro' });
  const fichaToninho = `/app/grupos/${grupo.id}/jogadores/${toninhoId}`;

  // GEL-97: notas 8, 7, 6, 7, 8 e 5 → média 6,83 → "Nível 6,8".
  await pagina.goto(fichaToninho);
  const notas = [8, 7, 6, 7, 8, 5];
  for (const [i, habilidade] of HABILIDADES.entries()) {
    const gravou = pagina.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes(`/jogadores/${toninhoId}/notas/`),
    );
    await pagina.getByLabel(habilidade, { exact: true }).selectOption(String(notas[i]));
    expect((await gravou).status()).toBe(200);
  }
  await expect(pagina.getByText('Nível 6,8', { exact: true })).toBeVisible();

  // GEL-85, GEL-86: renomear "Drible" mantém as notas.
  await pagina.goto(`/app/grupos/${grupo.id}/habilidades`);
  const drible = pagina.getByLabel('Nome da habilidade 4');
  await expect(drible).toHaveValue('Drible');
  const renomeou = pagina.waitForResponse((r) => r.request().method() !== 'GET' && r.url().includes('/habilidades/'));
  await drible.fill('Drible curto');
  await drible.press('Enter');
  expect((await renomeou).ok()).toBe(true);

  // GEL-92 a GEL-94: excluir "Chute" confirmando o aviso apaga as notas dela.
  await pagina.getByRole('button', { name: 'Excluir Chute' }).click();
  const aviso = pagina.getByRole('alertdialog', { name: 'Excluir “Chute”?' });
  await aviso.getByRole('button', { name: 'Excluir habilidade' }).click();
  await expect(aviso).toHaveCount(0);
  await expect(pagina.getByRole('list', { name: 'Habilidades' }).getByRole('listitem')).toHaveCount(5);

  // Sem o 8 de Chute: 8, 7, 6, 7, 5 → 6,6 (GEL-101).
  await pagina.goto(fichaToninho);
  await expect(pagina.getByText('Nível 6,6', { exact: true })).toBeVisible();
  await expect(pagina.getByLabel('Drible curto', { exact: true })).toHaveValue('7');
  await expect(pagina.getByLabel('Chute', { exact: true })).toHaveCount(0);

  // GEL-98, GEL-102: apagar todas as notas de outro jogador → "sem nota".
  const [primeira] = await habilidadesPelaApi(pagina, grupo.id);
  const r = await pagina.request.put(`/api/grupos/${grupo.id}/jogadores/${zeId}/notas/${primeira?.id ?? ''}`, {
    headers: CABECALHO,
    data: { nota: 9 },
  });
  expect(r.status()).toBe(200);
  await pagina.goto(`/app/grupos/${grupo.id}/jogadores/${zeId}`);
  await expect(pagina.getByText('Nível 9,0', { exact: true })).toBeVisible();
  await pagina.getByLabel(primeira?.nome ?? '', { exact: true }).selectOption('');
  await expect(pagina.getByText('sem nota', { exact: true })).toBeVisible();
  await pagina.goto(`/app/grupos/${grupo.id}/jogadores`);
  const ativos = pagina.getByRole('list', { name: 'Jogadores ativos' });
  await expect(ativos.getByRole('listitem').filter({ hasText: 'Zé Sem Nota' })).toContainText('sem nota');

  // GEL-103: Toninho tem notas; a exclusão é recusada com "Inativar em vez disso".
  await pagina.goto(fichaToninho);
  await pagina.getByRole('button', { name: 'Excluir jogador' }).click();
  const excluir = pagina.getByRole('alertdialog', { name: 'Excluir Toninho?' });
  await excluir.getByRole('button', { name: 'Excluir jogador' }).click();
  await expect(pagina.getByRole('button', { name: 'Inativar em vez disso' })).toBeVisible();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Toninho' })).toBeVisible();
  await pagina.context().close();
});

test('J-14: a convidada recebe recusa ao arquivar; a criadora arquiva e reativa; a convidada deixa de ver e volta a ver', async ({
  browser,
}) => {
  // C cria o grupo, com um jogador com nota, e convida O pela tela de admins (como a J-08).
  const c = await aparelho(browser);
  await contaNova(c, 'Criadora Catorze', 'j14c');
  const nome = `Pelada Catorze ${sufixo()}`;
  const grupo = await criarGrupoPelaApi(c, nome);
  const jogadorId = await criarJogadorPelaApi(c, grupo.id, 'Bigode');
  const [habilidade] = await habilidadesPelaApi(c, grupo.id);
  expect(
    (
      await c.request.put(`/api/grupos/${grupo.id}/jogadores/${jogadorId}/notas/${habilidade?.id ?? ''}`, {
        headers: CABECALHO,
        data: { nota: 7 },
      })
    ).status(),
  ).toBe(200);

  await c.goto(`/app/grupos/${grupo.id}/admins`);
  const emailO = emailNovo('j14o');
  await c.getByLabel('E-mail').fill(emailO);
  await c.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(c.getByText(`Convite enviado para ${emailO}. Vale por 7 dias.`)).toBeVisible();

  const o = await aparelho(browser);
  await o.goto(await linkDoEmail(c.request, emailO, 'convite'));
  await o.getByLabel('Seu nome').fill('Outra Catorze');
  await o.getByLabel('Senha', { exact: true }).fill(SENHA);
  await o.getByRole('checkbox').check();
  await o.getByRole('button', { name: 'Criar conta e aceitar' }).click();
  await expect(o).toHaveURL(new RegExp(`/app/grupos/${grupo.id}/admins$`));

  // O que O vê antes de arquivar: jogadores (com nível), habilidades e slug.
  async function retrato() {
    const [detalhe, jogadores, habilidades] = await Promise.all([
      o.request.get(`/api/grupos/${grupo.id}`),
      o.request.get(`/api/grupos/${grupo.id}/jogadores`),
      o.request.get(`/api/grupos/${grupo.id}/habilidades`),
    ]);
    expect([detalhe.status(), jogadores.status(), habilidades.status()]).toEqual([200, 200, 200]);
    return {
      slug: ((await detalhe.json()) as { slug?: string }).slug,
      jogadores: await jogadores.json(),
      habilidades: await habilidades.json(),
    };
  }
  const antes = await retrato();
  expect(antes.slug).toBe(grupo.slug);

  // GEL-24, GEL-25: O não vê a zona de arquivar e a API responde 403 so_quem_criou.
  await o.goto(`/app/grupos/${grupo.id}/dados`);
  await expect(o.getByRole('heading', { level: 1, name: 'Dados do grupo' })).toBeVisible();
  await expect(o.getByRole('heading', { name: 'Arquivar grupo' })).toHaveCount(0);
  await expect(o.getByRole('button', { name: 'Arquivar grupo' })).toHaveCount(0);
  const recusa = await o.request.post(`/api/grupos/${grupo.id}/arquivar`, {
    headers: CABECALHO,
    data: { nomeConfirmacao: nome },
  });
  expect(recusa.status()).toBe(403);
  expect(await recusa.json()).toMatchObject({ codigo: 'so_quem_criou' });

  // SEC-001: O não remove C dos admins.
  const admins = (await (await o.request.get(`/api/grupos/${grupo.id}/admins`)).json()) as {
    admins: { id: string; nome: string }[];
  };
  const idC = admins.admins.find((a) => a.nome === 'Criadora Catorze')?.id ?? '';
  expect(idC).not.toBe('');
  const remover = await o.request.delete(`/api/grupos/${grupo.id}/admins/${idC}`, { headers: CABECALHO });
  expect(remover.status()).toBe(409);
  expect(await remover.json()).toMatchObject({ codigo: 'criadora_nao_removivel' });

  // GEL-22: C arquiva digitando o nome exato.
  await c.goto(`/app/grupos/${grupo.id}/dados`);
  await c.getByRole('button', { name: 'Arquivar grupo' }).click();
  const arquivar = c.getByRole('alertdialog', { name: `Arquivar “${nome}”?` });
  await arquivar.getByLabel('Digite o nome do grupo para confirmar').fill(nome);
  await arquivar.getByRole('button', { name: 'Arquivar grupo' }).click();
  await expect(c).toHaveURL(/\/app$/);
  await expect(c.getByText('Grupo arquivado.')).toBeVisible();

  // GEL-26, GEL-27: O não vê o grupo na lista e recebe 404 nas rotas.
  await o.goto('/app');
  await expect(o.getByRole('heading', { level: 1, name: 'Seus grupos' })).toBeVisible();
  await expect(o.getByText(nome)).toHaveCount(0);
  expect((await o.request.get(`/api/grupos/${grupo.id}`)).status()).toBe(404);
  expect((await o.request.get(`/api/grupos/${grupo.id}/jogadores`)).status()).toBe(404);
  await o.goto(`/app/grupos/${grupo.id}`);
  await expect(o.getByText('Grupo não encontrado.')).toBeVisible();

  // GEL-30, SEC-009: C o vê só em "Arquivados", e as escritas dela respondem grupo_arquivado.
  await c.goto('/app');
  await expect(c.getByRole('list', { name: 'Seus grupos' }).getByText(nome)).toHaveCount(0);
  await expect(c.getByRole('list', { name: 'Arquivados' }).getByText(nome)).toBeVisible();
  const escrita = await c.request.post(`/api/grupos/${grupo.id}/jogadores`, {
    headers: CABECALHO,
    data: { apelido: 'Novato', anoNascimento: 1995, posicao: 'meia' },
  });
  expect(escrita.status()).toBe(409);
  expect(await escrita.json()).toMatchObject({ codigo: 'grupo_arquivado' });

  // GEL-28: C reativa.
  await c.getByRole('button', { name: `Reativar ${nome}` }).click();
  await c.getByRole('dialog', { name: `Reativar “${nome}”?` }).getByRole('button', { name: 'Reativar grupo' }).click();
  await expect(c.getByText('Grupo reativado.')).toBeVisible();
  await expect(c.getByRole('list', { name: 'Seus grupos' }).getByText(nome)).toBeVisible();

  // O volta a ver o grupo com jogadores, habilidades, notas e slug iguais.
  await o.goto('/app');
  await expect(o.getByRole('list', { name: 'Seus grupos' }).getByText(nome)).toBeVisible();
  expect(await retrato()).toEqual(antes);

  await o.context().close();
  await c.context().close();
});
