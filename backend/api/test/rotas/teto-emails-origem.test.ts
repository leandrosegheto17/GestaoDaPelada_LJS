import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { limiteEmailsIpHora } from '../../src/entrada/middlewares/limite-emails-origem.ts';
import { cenarioDeAcesso, SENHA } from '../apoio/acesso.ts';
import { GRUPO_A } from '../apoio/cenario-dois-grupos.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao } from '../apoio/sessao-worker.ts';

// Teto de pedidos de e-mail por origem (ACE-73; SEC-CA-02, T66): um mesmo IPv4, ou um mesmo /48 de IPv6, pede no
// máximo 20 e-mails por hora, somando cadastro, reenvio de confirmação, convite e "esqueci a senha"; o 21º pedido
// recebe 429 muitas_requisicoes antes de reservar a cota do dia. O padrão da suíte é alto (os outros testes de rota
// pedem muitos e-mails sem IP); aqui o ambiente volta ao padrão de 20. Cada teste usa origens aleatórias, porque a
// contagem fica no banco de teste por 1 h.

const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();
const comLimite = (valor: string | undefined): Cloudflare.Env => ({ ...env, LIMITE_EMAILS_IP_HORA: valor });
const PADRAO = comLimite(undefined);
const MUITAS = { erro: { codigo: 'muitas_requisicoes' } };

const grupo16 = () => Math.floor(Math.random() * 0x10000).toString(16);
/** Um /48 aleatório; `endereco(i)` dá um endereço num /64 diferente dele para cada i. */
function novo48() {
  const prefixo = `3fff:${grupo16()}:${grupo16()}`;
  return (i: number) => `${prefixo}:${i.toString(16)}::${grupo16()}`;
}
const novoIpv4 = () =>
  `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
async function lerTotalHoje(): Promise<number> {
  const [linha] = await comoOwner<{ total: number }>(`SELECT total FROM envios_email_dia WHERE dia = ${HOJE_SP}`);
  return linha?.total ?? 0;
}

async function liberarIntervalo(email: string): Promise<void> {
  await comoOwner("DELETE FROM envios_email WHERE destino_hash = digest($1::text, 'sha256')", [email]);
}

const emailNovo = () => `origem-${crypto.randomUUID()}@exemplo.com`;
const cadastro = (email: string) => ({ nome: 'Pessoa Origem', email, senha: SENHA, termos: true });
const esqueci = (email: string, ip: string, ambiente = PADRAO) =>
  pedir('POST', '/api/sessao/esqueci-senha', { email }, { ip, env: ambiente });
const enviadosPara = (email: string) => remetente.mensagens.filter((m) => m.para === email);

beforeEach(() => {
  remetente.mensagens.length = 0;
});

describe('teto de e-mails por /48 (ACE-73)', () => {
  it('as 4 rotas somam juntas; o 21º pedido do mesmo /48 recebe 429 sem enviar e sem gastar a cota', async () => {
    const endereco = novo48();
    const s = await criarSessao(GRUPO_A);
    const confirmada = await contaConfirmada();
    await liberarIntervalo(confirmada.email);
    remetente.mensagens.length = 0;

    // 20 pedidos, cada um de um /64 diferente do mesmo /48: 2 cadastros, 2 reenvios, 2 convites e 14 "esqueci".
    const caminhoConvite = `/api/grupos/${GRUPO_A.grupo}/admins/convites`;
    let i = 0;
    for (let k = 0; k < 2; k++) {
      const extras = { ip: endereco(i++), env: PADRAO };
      expect((await pedir('POST', '/api/conta', cadastro(emailNovo()), extras)).status).toBe(201);
    }
    for (let k = 0; k < 2; k++) {
      const extras = { ip: endereco(i++), env: PADRAO };
      expect((await pedir('POST', '/api/conta/reenviar-confirmacao', { email: emailNovo() }, extras)).status).toBe(200);
    }
    for (let k = 0; k < 2; k++) {
      const extras = { cookie: s.cookie, ip: endereco(i++), env: PADRAO };
      expect((await pedir('POST', caminhoConvite, { email: emailNovo() }, extras)).status).toBe(201);
    }
    while (i < 20) expect((await esqueci(emailNovo(), endereco(i++))).status).toBe(200);

    const antes = await lerTotalHoje();
    // O 21º, de mais um /64 do mesmo /48, para uma conta que receberia o e-mail.
    const r = await esqueci(confirmada.email, endereco(i));
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject(MUITAS);
    expect(enviadosPara(confirmada.email)).toHaveLength(0);
    expect(await lerTotalHoje()).toBe(antes);

    // As outras rotas de e-mail do mesmo /48 também recebem 429.
    const novoCadastro = await pedir('POST', '/api/conta', cadastro(emailNovo()), { ip: endereco(99), env: PADRAO });
    expect(novoCadastro.status).toBe(429);
    const convite = await pedir(
      'POST',
      caminhoConvite,
      { email: emailNovo() },
      { cookie: s.cookie, ip: endereco(98), env: PADRAO },
    );
    expect(convite.status).toBe(429);

    // Outro /48 não é afetado: o mesmo pedido envia.
    const r2 = await esqueci(confirmada.email, novo48()(0));
    expect(r2.status).toBe(200);
    expect(enviadosPara(confirmada.email)).toHaveLength(1);
  });

  it('rotas que não enviam e-mail não contam nem são barradas pelo teto', async () => {
    const endereco = novo48();
    const DOIS = comLimite('2');
    expect((await esqueci(emailNovo(), endereco(0), DOIS)).status).toBe(200);
    expect((await esqueci(emailNovo(), endereco(1), DOIS)).status).toBe(200);
    expect((await esqueci(emailNovo(), endereco(2), DOIS)).status).toBe(429);
    const entrar = await pedir(
      'POST',
      '/api/sessao/entrar',
      { email: emailNovo(), senha: 'senha-errada-1' },
      { ip: endereco(3), env: DOIS },
    );
    expect(entrar.status).toBe(401);
  });
});

describe('teto de e-mails por IPv4 (ACE-73)', () => {
  it('20 pedidos do mesmo IPv4 passam, o 21º recebe 429; outro IPv4 segue', async () => {
    const ip = novoIpv4();
    for (let i = 0; i < 20; i++) expect((await esqueci(emailNovo(), ip)).status).toBe(200);
    const r = await esqueci(emailNovo(), ip);
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject(MUITAS);
    let outro = novoIpv4();
    while (outro === ip) outro = novoIpv4();
    expect((await esqueci(emailNovo(), outro)).status).toBe(200);
  });

  it('IPv4 mapeado em IPv6 conta como o próprio IPv4', async () => {
    const ip = novoIpv4();
    const DOIS = comLimite('2');
    expect((await esqueci(emailNovo(), ip, DOIS)).status).toBe(200);
    expect((await esqueci(emailNovo(), `::ffff:${ip}`, DOIS)).status).toBe(200);
    expect((await esqueci(emailNovo(), ip, DOIS)).status).toBe(429);
  });
});

describe('LIMITE_EMAILS_IP_HORA (ACE-73)', () => {
  it('inteiro positivo; ausente ou inválido, o padrão 20', () => {
    expect(limiteEmailsIpHora('5')).toBe(5);
    expect(limiteEmailsIpHora(' 30 ')).toBe(30);
    for (const v of [undefined, '', 'abc', '0', '-1', '1.5', '1e3']) expect(limiteEmailsIpHora(v)).toBe(20);
  });
});
