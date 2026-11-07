import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { CABECALHO_DEV_EMAILS, URL_BASE, URL_PUSH_FALSO, VAPID_E2E } from '../playwright.config.ts';

/**
 * Jornada J-34 de `.specs/projeto/jornadas.md` (notificacoes T41; NOT-63, NOT-64; também NOT-02, NOT-05, NOT-13,
 * NOT-16, NOT-17, NOT-20, NOT-26, NOT-27): assinar o ranking, o admin lança a partida, o aviso chega, cancelar. Contra
 * o `wrangler dev` do e2e com as VAPID do e2e, `PUSH_HOSTS_DEV` e o push falso (`playwright.config.ts`), no molde de
 * `e2e/partidas.spec.ts` (os ajudantes se repetem: importar um spec registraria os testes dele de novo).
 *
 * O navegador de teste não fala com um serviço de push de verdade: o `PushManager`, o `Notification` e o
 * `serviceWorker.ready` da página são trocados antes de carregar (`addInitScript`) por um que assina com chaves P-256 de
 * verdade (a API cifra para elas) e um `endpoint` no push falso. O push falso guarda o que chega sem decifrar.
 *
 * SPEC_DEVIATION: os passos 4 (tocar na notificação) e o texto da notificação ficam provados pelos testes do service
 * worker (T34); aqui o SW de verdade fica bloqueado, como nas outras jornadas.
 */

const SENHA = 'SenhaForte123';
const CABECALHO = { 'X-Pelada': '1' };

function sufixo(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
}

function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
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
        const r = await request.get('/api/dev/emails', { headers: CABECALHO_DEV_EMAILS });
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
async function aparelho(browser: Browser): Promise<Page> {
  ultimoIp += 1;
  const contexto = await browser.newContext({
    baseURL: URL_BASE,
    serviceWorkers: 'block',
    extraHTTPHeaders: { 'cf-connecting-ip': `198.51.100.${ultimoIp}` },
  });
  return contexto.newPage();
}

async function contaNova(pagina: Page, nome: string): Promise<string> {
  const email = `push-${sufixo()}@exemplo.test`;
  await pagina.goto('/cadastro');
  await pagina.getByLabel('Seu nome').fill(nome);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA);
  await pagina.getByRole('checkbox').check();
  await pagina.getByRole('button', { name: 'Criar conta' }).click();
  await expect(pagina.getByText('Enviamos um link de confirmação para o seu e-mail')).toBeVisible();
  await pagina.goto(await linkDoEmail(pagina.request, email, 'confirmacao'));
  await pagina.goto('/entrar');
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await expect(pagina).toHaveURL(/\/app$/);
  return email;
}

/**
 * O navegador com push simulado: `Notification` com a permissão concedida no pedido, `PushManager` e
 * `serviceWorker.ready` com um gerente que assina com P-256 de verdade e `endpoint` no push falso. A assinatura fica em
 * `window.__assinaturaE2e`, para a jornada ler o `endpoint` e o `auth`.
 */
async function comPushSimulado(pagina: Page): Promise<void> {
  await pagina.addInitScript(
    ({ base }) => {
      const b64 = (bytes: Uint8Array) =>
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      let permissao: NotificationPermission = 'default';
      let atual: unknown = null;
      class NotificacaoFalsa {
        static get permission() {
          return permissao;
        }
        static async requestPermission() {
          permissao = 'granted';
          return permissao;
        }
      }
      const gerente = {
        getSubscription: async () => atual,
        subscribe: async (opcoes: { applicationServerKey: Uint8Array }) => {
          const par = (await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
          )) as CryptoKeyPair;
          const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
          const auth = crypto.getRandomValues(new Uint8Array(16));
          const token = b64(crypto.getRandomValues(new Uint8Array(12)));
          const json = {
            endpoint: `${base}/push/${token}`,
            keys: { p256dh: b64(publica), auth: b64(auth) },
          };
          const chave = new Uint8Array(opcoes.applicationServerKey);
          atual = {
            options: { applicationServerKey: chave.buffer },
            toJSON: () => json,
            unsubscribe: async () => {
              atual = null;
              return true;
            },
          };
          (window as unknown as { __assinaturaE2e: unknown }).__assinaturaE2e = {
            ...json,
            chave: b64(chave),
          };
          return atual;
        },
      };
      Object.defineProperty(window, 'Notification', {
        value: NotificacaoFalsa,
        configurable: true,
      });
      Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          ready: Promise.resolve({ pushManager: gerente }),
          register: async () => ({ update: async () => undefined }),
          getRegistration: async () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          controller: null,
        },
      });
    },
    { base: URL_PUSH_FALSO },
  );
}

interface Recebida {
  caminho: string;
  ttl: string | null;
  topic: string | null;
  urgency: string | null;
  contentEncoding: string | null;
  comAutorizacao: boolean;
  bytes: number;
}

async function recebidas(request: APIRequestContext): Promise<Recebida[]> {
  const r = await request.get(`${URL_PUSH_FALSO}/teste/recebidas`);
  return ((await r.json()) as { recebidas: Recebida[] }).recebidas;
}

test('NOT-64, NOT-63: J-34 assinar o ranking, o admin lança a partida, o aviso chega e cancelar', async ({
  browser,
  request,
}) => {
  await request.post(`${URL_PUSH_FALSO}/teste/limpar`);

  // Admin: conta, grupo novo (nasce em trial, com push liberado) e um jogador.
  const admin = await aparelho(browser);
  await contaNova(admin, 'Admin do Push');
  const g = await admin.request.post('/api/grupos', {
    headers: CABECALHO,
    data: {
      nome: `Pelada Push ${sufixo()}`,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
  });
  expect(g.status()).toBe(201);
  const grupo = (await g.json()) as { id: string; slug: string };
  const j = await admin.request.post(`/api/grupos/${grupo.id}/jogadores`, {
    headers: CABECALHO,
    data: { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia', dataEntrada: '2026-01-01' },
  });
  expect(j.status()).toBe(201);
  const jogadorId = ((await j.json()) as { id: string }).id;

  // Jogador: página pública com o push simulado; todo pedido da página é para a própria máquina (NOT-63).
  const jogador = await aparelho(browser);
  const hosts = new Set<string>();
  jogador.on('request', (r) => hosts.add(new URL(r.url()).hostname));
  await comPushSimulado(jogador);
  await jogador.goto(`/g/${grupo.slug}`);
  await jogador.getByRole('button', { name: 'Receber avisos do ranking' }).click();
  await expect(jogador.getByRole('button', { name: 'Parar de receber avisos' })).toBeVisible();

  const assinatura = (await jogador.evaluate(
    () => (window as unknown as { __assinaturaE2e: unknown }).__assinaturaE2e,
  )) as { endpoint: string; keys: { auth: string }; chave: string };
  // NOT-02: o `subscribe` recebeu a chave pública VAPID do servidor.
  expect(assinatura.chave).toBe(VAPID_E2E.publica);

  // Admin lança a partida do dia: o aviso sai depois do COMMIT, pela fila (NOT-20).
  const p = await admin.request.post(`/api/grupos/${grupo.id}/partidas`, {
    headers: CABECALHO,
    data: { data: hoje(), choveu: false, marcacoes: [{ jogadorId, situacao: 'presente' }] },
  });
  expect(p.status()).toBe(201);

  // NOT-64: o push falso recebe uma requisição aes128gcm com VAPID, no endpoint da assinatura.
  await expect
    .poll(async () => (await recebidas(request)).length, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(1);
  const [aviso] = await recebidas(request);
  expect(aviso).toMatchObject({
    caminho: new URL(assinatura.endpoint).pathname,
    contentEncoding: 'aes128gcm',
    comAutorizacao: true,
    urgency: 'normal',
    ttl: '86400',
  });
  expect(aviso!.topic?.length ?? 0).toBeGreaterThan(0);
  expect(aviso!.bytes).toBeGreaterThan(0);

  // Cancelar: a tela volta a "Receber avisos" e o servidor diz que a assinatura não existe mais (NOT-16, NOT-17).
  await jogador.getByRole('button', { name: 'Parar de receber avisos' }).click();
  await expect(jogador.getByRole('button', { name: 'Receber avisos do ranking' })).toBeVisible();
  const estado = await request.post(`/api/publico/${grupo.slug}/push/estado`, {
    headers: CABECALHO,
    data: { endpoint: assinatura.endpoint, chaves: { auth: assinatura.keys.auth } },
  });
  expect(estado.status()).toBe(200);
  expect(await estado.json()).toEqual({ assinado: false });

  // NOT-63: a página só falou com a própria máquina (o Worker e o push falso são locais).
  for (const host of hosts) expect(['127.0.0.1', 'localhost']).toContain(host);
});
