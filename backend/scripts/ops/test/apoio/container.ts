import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { join } from 'node:path';

/**
 * Container de teste `postgres:18` com `age` instalado. Equivalente à mão:
 *   docker build -t pelada-teste-age -f- . (Dockerfile: FROM postgres:18 + apt-get install age)
 *   docker run -d --rm -e POSTGRES_PASSWORD=postgres pelada-teste-age
 * O servidor e os clientes rodam dentro do mesmo container, removido no fim do teste.
 */
export const IMAGEM = 'pelada-teste-age';
export const RAIZ = join(import.meta.dirname, '..', '..', '..', '..', '..');
export const SCRIPT_DUMP = join(RAIZ, '.github', 'actions', 'dump-cifrado', 'dump-cifrado.sh');

const DOCKERFILE = [
  'FROM postgres:18',
  'RUN apt-get update && apt-get install -y --no-install-recommends age && rm -rf /var/lib/apt/lists/*',
  '',
].join('\n');

function docker(args: string[], opcoes: ExecFileSyncOptions = {}): string {
  return execFileSync('docker', args, { encoding: 'utf8', ...opcoes }).toString();
}

export interface Resultado {
  codigo: number;
  saida: string;
  erro: string;
}

function rodar(args: string[], entrada?: Buffer | string): Resultado {
  try {
    const saida = execFileSync('docker', args, {
      input: entrada ?? '',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
    return { codigo: 0, saida: saida.toString(), erro: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      codigo: err.status ?? 1,
      saida: err.stdout?.toString() ?? '',
      erro: err.stderr?.toString() ?? '',
    };
  }
}

function esperar(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export class ContainerAge {
  readonly id: string;
  /** Porta do Postgres do container publicada em 127.0.0.1, quando pedida. */
  readonly portaHost: number | undefined;

  private constructor(id: string, portaHost: number | undefined) {
    this.id = id;
    this.portaHost = portaHost;
  }

  static iniciar(opcoes: { publicarPorta?: boolean } = {}): ContainerAge {
    docker(['build', '-q', '-t', IMAGEM, '-'], {
      input: DOCKERFILE,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const porta = opcoes.publicarPorta ? ['-p', '127.0.0.1::5432'] : [];
    const id = docker([
      'run',
      '-d',
      '--rm',
      ...porta,
      '-e',
      'POSTGRES_PASSWORD=postgres',
      IMAGEM,
    ]).trim();
    let portaHost: number | undefined;
    if (opcoes.publicarPorta) {
      const linha = docker(['port', id, '5432/tcp']).split('\n')[0] ?? '';
      portaHost = Number(linha.slice(linha.lastIndexOf(':') + 1));
    }
    const c = new ContainerAge(id, portaHost);
    for (let i = 0; i < 120; i++) {
      if (c.sh('pg_isready -U postgres -h 127.0.0.1').codigo === 0) return c;
      esperar(500);
    }
    c.parar();
    throw new Error('container de teste não ficou pronto');
  }

  /** Roda um script bash no container, sem lançar em código != 0. */
  sh(script: string, env: Record<string, string> = {}, entrada?: Buffer | string): Resultado {
    const vars = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    return rodar(['exec', '-i', ...vars, this.id, 'bash', '-c', script], entrada);
  }

  copiarPara(origem: string, destino: string): void {
    docker(['cp', origem, `${this.id}:${destino}`]);
  }

  copiarDe(origem: string, destino: string): void {
    docker(['cp', `${this.id}:${origem}`, destino]);
  }

  /** Cria a chave age de teste e devolve a pública. A privada fica em /chave.txt. */
  gerarChave(): string {
    const r = this.sh('age-keygen -o /chave.txt 2>/dev/null && age-keygen -y /chave.txt');
    if (r.codigo !== 0) throw new Error(`age-keygen falhou: ${r.erro}`);
    return r.saida.trim();
  }

  /** Banco com 2 grupos e 3 jogadores, para os testes de dump e restauração. */
  criarBancoComGrupos(nome: string): void {
    const sql = [
      'CREATE TABLE grupos (id int PRIMARY KEY, nome text);',
      "INSERT INTO grupos VALUES (1, 'A'), (2, 'B');",
      'CREATE TABLE jogadores (id int PRIMARY KEY, grupo_id int REFERENCES grupos(id));',
      'INSERT INTO jogadores VALUES (1, 1), (2, 1), (3, 2);',
    ].join('\n');
    const r = this.sh(
      `psql -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE ${nome}" && psql -v ON_ERROR_STOP=1 -U postgres -d ${nome}`,
      {},
      sql,
    );
    if (r.codigo !== 0) throw new Error(`criar banco falhou: ${r.erro}`);
  }

  parar(): void {
    rodar(['rm', '-f', this.id]);
  }
}
