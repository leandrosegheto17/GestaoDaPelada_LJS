// Critério: FUN-40 (branch de restauração no Neon, mantendo só as 2 mais recentes).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { branchesAntigos, idDoBranchPai, main } from '../restauracao-neon.ts';

const script = fileURLToPath(new URL('../restauracao-neon-cli.ts', import.meta.url));

const rodarCli = (stdin: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { input: stdin, encoding: 'utf8', timeout: 60_000 });

// Os dois one-liners que o deploy.yml usava antes, mantidos aqui só para provar paridade de comportamento.
const PAI_ORIGINAL =
  'const n=process.argv[1];let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s).branches.find(x=>x.name===n);if(!b){process.exit(1)}console.log(b.id)})';
const ANTIGOS_ORIGINAL =
  'const p="restauracao-"+process.argv[1]+"-";let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s).branches.filter(x=>x.name.startsWith(p)).sort((a,b)=>a.created_at<b.created_at?1:-1).slice(2);for(const b of l)console.log(b.id)})';

const original = (codigo: string, stdin: string, arg: string) =>
  spawnSync(process.execPath, ['-e', codigo, arg], { input: stdin, encoding: 'utf8' });

type B = { id: string; name: string; created_at: string };
const b = (id: string, name: string, created_at: string): B => ({ id, name, created_at });
const corpo = (branches: B[]) => JSON.stringify({ branches });

const producao = b('br-prod', 'production', '2026-01-01T00:00:00Z');
const rest = (n: number) => b(`br-r${n}`, `restauracao-producao-${n}`, `2026-10-0${n}T10:00:00Z`);

describe('idDoBranchPai', () => {
  it('devolve o id do branch com o nome exato', () => {
    expect(idDoBranchPai(corpo([rest(1), producao]), 'production')).toBe('br-prod');
  });

  it('usa o primeiro quando há nomes repetidos', () => {
    const c = corpo([b('a', 'production', '1'), b('b', 'production', '2')]);
    expect(idDoBranchPai(c, 'production')).toBe('a');
  });

  it.each([
    ['pai ausente', corpo([rest(1)])],
    ['lista vazia', corpo([])],
    ['JSON inválido', '{nao-json'],
    ['corpo vazio', ''],
    ['sem branches', '{}'],
    ['null', 'null'],
  ])('falha fechado: %s', (_n, c) => {
    expect(() => idDoBranchPai(c, 'production')).toThrow();
  });

  it('não ecoa o corpo da resposta na mensagem de erro', () => {
    const segredo = 'SEGREDO-NO-CORPO';
    for (const c of [`{${segredo}`, JSON.stringify({ branches: [], x: segredo })]) {
      try {
        idDoBranchPai(c, 'production');
        throw new Error('deveria falhar');
      } catch (erro) {
        expect((erro as Error).message).not.toContain(segredo);
      }
    }
  });
});

describe('branchesAntigos', () => {
  it('lista vazia: nada a apagar', () => {
    expect(branchesAntigos(corpo([producao]), 'producao')).toEqual([]);
    expect(branchesAntigos(corpo([]), 'producao')).toEqual([]);
  });

  it.each([
    [1, []],
    [2, []],
    [3, ['br-r1']],
    [5, ['br-r3', 'br-r2', 'br-r1']],
  ])('%i branches de restauração: apaga só os mais velhos', (n, esperado) => {
    const lista = Array.from({ length: n }, (_, i) => rest(i + 1));
    expect(branchesAntigos(corpo([producao, ...lista]), 'producao')).toEqual(esperado);
  });

  it('ordena por created_at, não pela ordem da lista', () => {
    const c = corpo([rest(3), rest(1), rest(4), rest(2)]);
    expect(branchesAntigos(c, 'producao')).toEqual(['br-r2', 'br-r1']);
  });

  it('nunca lista branch fora do prefixo restauracao-<ambiente>-', () => {
    const c = corpo([
      producao,
      b('x1', 'restauracao-homologacao-1', '2020-01-01T00:00:00Z'),
      b('x2', 'restauracao-producao', '2020-01-01T00:00:00Z'),
      b('x3', 'Restauracao-producao-9', '2020-01-01T00:00:00Z'),
      b('x4', 'outro-restauracao-producao-9', '2020-01-01T00:00:00Z'),
      rest(1),
      rest(2),
      rest(3),
    ]);
    expect(branchesAntigos(c, 'producao')).toEqual(['br-r1']);
  });

  it('o branch production nunca é listado, mesmo com ambiente vazio', () => {
    expect(branchesAntigos(corpo([producao, rest(1), rest(2), rest(3)]), '')).toEqual([]);
  });

  it.each([['{nao-json'], [''], ['{}'], ['null']])('falha fechado com corpo inválido %j', (c) => {
    expect(() => branchesAntigos(c, 'producao')).toThrow();
  });

  it('branch sem name falha fechado em vez de pular', () => {
    expect(() => branchesAntigos(JSON.stringify({ branches: [{ id: 'x' }] }), 'producao')).toThrow();
  });
});

describe('paridade com os node -e originais', () => {
  const cenarios: Array<[string, string]> = [
    ['vazio', corpo([])],
    ['só production', corpo([producao])],
    ['1 restauração', corpo([producao, rest(1)])],
    ['2 restaurações', corpo([producao, rest(1), rest(2)])],
    ['3 restaurações', corpo([producao, rest(3), rest(1), rest(2)])],
    ['5 restaurações embaralhadas', corpo([rest(4), producao, rest(1), rest(5), rest(2), rest(3)])],
    [
      'outros prefixos',
      corpo([producao, b('h', 'restauracao-homologacao-1', '2020'), rest(1), rest(2), rest(3), b('o', 'dev', '2019')]),
    ],
    ['JSON inválido', '{nao-json'],
    ['sem branches', '{}'],
  ];

  it.each(cenarios)('pai: %s', (_n, c) => {
    const ref = original(PAI_ORIGINAL, c, 'production');
    let esperado: string | null;
    try {
      esperado = idDoBranchPai(c, 'production');
    } catch {
      esperado = null;
    }
    if (ref.status === 0) expect(esperado).toBe(ref.stdout.trim());
    else expect(esperado).toBeNull();
  });

  it.each(cenarios)('antigos: %s', (_n, c) => {
    const ref = original(ANTIGOS_ORIGINAL, c, 'producao');
    let obtido: string[] | null;
    try {
      obtido = branchesAntigos(c, 'producao');
    } catch {
      obtido = null;
    }
    if (ref.status === 0) expect(obtido).toEqual(ref.stdout.split('\n').filter(Boolean));
    else expect(obtido).toBeNull();
  });
});

describe('main', () => {
  const pilha = (c: string) => () => c;

  it('exige --executar', () => {
    expect(main(['pai', 'production'], pilha(corpo([producao])))).toBe(1);
  });

  it('exige subcomando e argumento conhecidos', () => {
    expect(main(['--executar'], pilha(''))).toBe(1);
    expect(main(['apagar', 'x', '--executar'], pilha(''))).toBe(1);
    expect(main(['pai', '--executar'], pilha(corpo([producao])))).toBe(1);
  });

  it('retorna 1 quando o pai não existe', () => {
    expect(main(['pai', 'production', '--executar'], pilha(corpo([rest(1)])))).toBe(1);
  });

  it('retorna 0 quando acha o pai', () => {
    expect(main(['pai', 'production', '--executar'], pilha(corpo([producao])))).toBe(0);
  });
});

describe('CLI (processo real)', () => {
  it('pai: imprime só o id', () => {
    const r = rodarCli(corpo([rest(1), producao]), 'pai', 'production', '--executar');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('br-prod\n');
  });

  it('antigos: um id por linha', () => {
    const r = rodarCli(corpo([rest(1), rest(2), rest(3), rest(4)]), 'antigos', 'producao', '--executar');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('br-r2\nbr-r1\n');
  });

  it('pai ausente: sai 1, sem stdout e sem ecoar o corpo', () => {
    const r = rodarCli(JSON.stringify({ branches: [], seg: 'SEGREDO-NO-CORPO' }), 'pai', 'production', '--executar');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).not.toContain('SEGREDO-NO-CORPO');
  });

  it('JSON inválido: sai 1 sem ecoar o corpo', () => {
    const r = rodarCli('SEGREDO-NO-CORPO', 'antigos', 'producao', '--executar');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).not.toContain('SEGREDO-NO-CORPO');
  });
});
