import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contarLinhas, restaurarBackup } from '../restaurar-backup.ts';
import { ContainerAge, SCRIPT_DUMP } from './apoio/container.ts';

// Container postgres:18 com age e a porta publicada em 127.0.0.1 (apoio/container.ts).
// O age e o pg_restore rodam dentro dele; a contagem e as travas rodam daqui.
let c: ContainerAge;
const dentro = (banco: string) => `postgres://postgres:postgres@127.0.0.1:5432/${banco}`;
const fora = (banco: string) => `postgres://postgres:postgres@127.0.0.1:${c.portaHost}/${banco}`;

beforeAll(() => {
  c = ContainerAge.iniciar({ publicarPorta: true });
  c.copiarPara(SCRIPT_DUMP, '/dump-cifrado.sh');
  const chave = c.gerarChave();
  c.criarBancoComGrupos('origem');
  const r = c.sh('bash /dump-cifrado.sh', {
    PG_URL: dentro('origem'),
    CHAVE_PUBLICA: chave,
    SAIDA: '/backup.age',
  });
  if (r.codigo !== 0) throw new Error(`dump falhou: ${r.erro}`);
}, 300_000);

afterAll(() => c?.parar());

function opcoes(banco: string) {
  return {
    arquivo: '/backup.age',
    chavePrivada: '/chave.txt',
    urlDestino: fora(banco),
    urlPgRestore: dentro(banco),
    comandoAge: ['docker', 'exec', '-i', c.id, 'age'],
    comandoPgRestore: ['docker', 'exec', '-i', c.id, 'pg_restore'],
  };
}

describe('restaurarBackup', () => {
  it('FUN-50: restaura num banco vazio com a contagem de linhas igual por tabela', async () => {
    c.sh('psql -U postgres -c "CREATE DATABASE destino"');
    const contagem = await restaurarBackup(opcoes('destino'));
    expect(contagem).toEqual(await contarLinhas(fora('origem')));
    expect(contagem).toEqual({ grupos: 2, jogadores: 3 });
  });

  it('FUN-50: recusa restaurar num host fora da lista de permitidos', async () => {
    await expect(
      restaurarBackup({
        ...opcoes('destino'),
        urlDestino: 'postgres://u:p@ep-abc.sa-east-1.aws.neon.tech/neondb',
        comandoAge: ['comando-que-nao-existe'],
      }),
    ).rejects.toThrow(/não permitido/);
  });

  it('FUN-50: recusa restaurar num banco que já tem tabelas', async () => {
    await expect(
      restaurarBackup({ ...opcoes('origem'), comandoAge: ['comando-que-nao-existe'] }),
    ).rejects.toThrow(/não está vazio/);
    expect(await contarLinhas(fora('origem'))).toEqual({ grupos: 2, jogadores: 3 });
  });

  it('FUN-50: chave privada errada falha e não deixa o banco como restaurado', async () => {
    c.sh(
      'psql -U postgres -c "CREATE DATABASE destino_ruim" && age-keygen -o /outra.txt 2>/dev/null',
    );
    await expect(
      restaurarBackup({ ...opcoes('destino_ruim'), chavePrivada: '/outra.txt' }),
    ).rejects.toThrow(/age falhou|pg_restore falhou/);
    expect(await contarLinhas(fora('destino_ruim'))).toEqual({});
  });
});
