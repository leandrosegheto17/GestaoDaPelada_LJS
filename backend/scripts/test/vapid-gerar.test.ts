import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cabecalhoVapid } from '@pelada/api/push/vapid';
import { describe, expect, it } from 'vitest';
import { campo, checarMarcacao, lerEnvExample } from '../checagens/env-example.ts';
import { RAIZ } from '../checagens/sem-url-absoluta.ts';
import { gerarParVapid, linhasDoPar } from '../src/vapid-gerar.ts';

/** `pnpm vapid:gerar` e as variáveis VAPID no `.env.example` (T4; NOT-14, NOT-60). */

const SCRIPT = join(import.meta.dirname, '..', 'src', 'vapid-gerar.ts');
const b = (texto: string) => new Uint8Array(Buffer.from(texto, 'base64url'));

describe('pnpm vapid:gerar', () => {
  it('NOT-14: o par gerado assina um JWT VAPID (T3) que verifica com a pública', async () => {
    const par = await gerarParVapid();
    expect(b(par.publica)).toHaveLength(65);
    expect(b(par.publica)[0]).toBe(0x04);
    expect(b(par.privada)).toHaveLength(32);
    expect(par.publica).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(par.privada).toMatch(/^[A-Za-z0-9_-]+$/);

    const valor = await cabecalhoVapid(
      'https://fcm.googleapis.com/fcm/send/x',
      { ...par, assunto: 'mailto:avisos@exemplo.com' },
      new Date('2026-11-05T12:00:00Z'),
    );
    const jwt = /^vapid t=([^,]+), k=/.exec(valor)?.[1] ?? '';
    const [h, c, s] = jwt.split('.');
    const chave = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: Buffer.from(b(par.publica).subarray(1, 33)).toString('base64url'),
        y: Buffer.from(b(par.publica).subarray(33, 65)).toString('base64url'),
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      chave,
      b(s ?? ''),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('NOT-14: dois pares seguidos são diferentes', async () => {
    const [um, dois] = [await gerarParVapid(), await gerarParVapid()];
    expect(um.privada).not.toBe(dois.privada);
    expect(um.publica).not.toBe(dois.publica);
  });

  it('NOT-14: o script imprime as duas variáveis e não grava arquivo', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pelada-vapid-'));
    try {
      const saida = execFileSync(process.execPath, [SCRIPT], { cwd: pasta, encoding: 'utf8' });
      expect(saida).toMatch(/^VAPID_PUBLICA=[A-Za-z0-9_-]{87}$/m);
      expect(saida).toMatch(/^VAPID_PRIVADA=[A-Za-z0-9_-]{43}$/m);
      expect(readdirSync(pasta)).toEqual([]);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('NOT-14: as linhas levam o aviso de segredo', () => {
    expect(linhasDoPar({ publica: 'P', privada: 'D' })).toBe(
      [
        '# Par VAPID novo. A privada é segredo: secret do Worker, nunca no git nem no .env.example.',
        'VAPID_PUBLICA=P',
        'VAPID_PRIVADA=D',
      ].join('\n'),
    );
  });
});

describe('.env.example com as variáveis VAPID', () => {
  const variaveis = lerEnvExample(readFileSync(join(RAIZ, '.env.example'), 'utf8'));
  const achar = (nome: string) => variaveis.find((v) => v.nome === nome);

  it.each(['VAPID_PUBLICA', 'VAPID_PRIVADA', 'VAPID_ASSUNTO'])(
    'NOT-60: %s está listada, opcional, com formato e sem valor',
    (nome) => {
      const v = achar(nome);
      expect(v).toBeDefined();
      expect(v?.valor).toBe('');
      expect(campo(v?.comentario ?? '', 'obrigatória')).toMatch(/^não \(opcional: sem as três VAPID o push fica desligado/);
      expect(campo(v?.comentario ?? '', 'formato')).not.toBe('');
    },
  );

  it('NOT-60: só a VAPID_PRIVADA é segredo', () => {
    expect(campo(achar('VAPID_PRIVADA')?.comentario ?? '', 'segredo')).toBe('sim');
    expect(campo(achar('VAPID_PUBLICA')?.comentario ?? '', 'segredo')).toBe('não');
    expect(campo(achar('VAPID_ASSUNTO')?.comentario ?? '', 'segredo')).toBe('não');
  });

  it('NOT-60: o formato do assunto cita mailto e URL', () => {
    expect(campo(achar('VAPID_ASSUNTO')?.comentario ?? '', 'formato')).toMatch(/mailto:.*URL/);
  });

  it('NOT-60: a marcação do FUN-46 passa nas três', () => {
    const vapid = variaveis.filter((v) => v.nome.startsWith('VAPID_'));
    expect(vapid).toHaveLength(3);
    expect(checarMarcacao(vapid)).toEqual([]);
  });
});
