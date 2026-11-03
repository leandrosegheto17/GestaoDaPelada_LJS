import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerEsquema } from '../../api/src/infraestrutura/db/esquema.ts';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import { referenciaDoEsquema } from '../../api/src/infraestrutura/db/referencia.ts';
import { comSaida, conectar } from './conectar.ts';
import { exigirHostPermitido } from './host.ts';

export const ARQUIVO_REFERENCIA = resolve(
  import.meta.dirname,
  '../../api/src/infraestrutura/db/migracoes/esquema-producao.txt',
);

/**
 * Cria um banco descartável no servidor local, migra só as migrações oficiais, lê o esquema
 * e devolve o texto da referência. O banco é removido no `finally`.
 */
export async function gerarReferencia(urlBase: string): Promise<string> {
  exigirHostPermitido(urlBase);
  const nome = `esquema_${randomBytes(6).toString('hex')}`;
  const url = new URL(urlBase);
  url.pathname = `/${nome}`;
  const admin = await conectar(urlBase);
  try {
    await admin.query(`create database ${nome}`);
    try {
      await migrar(url.toString());
      const c = await conectar(url.toString());
      try {
        return referenciaDoEsquema(await lerEsquema(c));
      } finally {
        await c.end();
      }
    } finally {
      await admin.query(`drop database if exists ${nome} with (force)`);
    }
  } finally {
    await admin.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await comSaida(async () => {
    const base = process.env.DATABASE_URL_TESTE ?? process.env.DATABASE_URL_MIGRACAO;
    if (!base) throw new Error('Defina DATABASE_URL_TESTE (veja .env.example)');
    writeFileSync(ARQUIVO_REFERENCIA, await gerarReferencia(base));
    console.log(`Referência gravada em ${ARQUIVO_REFERENCIA}`);
  });
}
