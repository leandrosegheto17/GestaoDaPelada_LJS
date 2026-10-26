import { arquivosVersionados, encerrar } from './arquivos.mjs';
import { lerYaml, linhaDe, percorrerMapas } from './yaml-estrutura.mjs';

// G-24: toda action de terceiros em workflow ou action composta é fixada por SHA de commit (40 hex), todo
// `actions/checkout` desliga a credencial persistida (`persist-credentials: false`) e o pnpm-workspace.yaml
// mantém a política de cadeia de suprimentos. Action local só vale dentro de `./.github/actions/` (ou `./`),
// sem segmento `..`. Os arquivos são lidos com o parser de YAML (não por linha de texto), então estilo flow,
// aspas e comentários não escondem um `uses`.
// O valor de `minimumReleaseAge` não é fixado aqui; só que seja um número maior que zero.
// SEC-004: imagem Docker também só por digest (`nome:tag@sha256:<64 hex>`): `services` e `container` dos jobs e todo
// `docker run` em `run:` de workflow ou action e em script `.sh` dentro de `.github/`. Opção desconhecida do
// `docker run` é tratada como opção com valor, então a imagem nunca é pulada sem ser conferida (falha fechado).
const RAIZ = process.argv[2] ?? process.cwd();
const CAMINHO_ACAO = /^\.github\/(workflows\/[^/]+\.ya?ml|actions\/[^/]+\/action\.ya?ml)$/i;
const PNPM = 'pnpm-workspace.yaml';
const LOCAL = /^\.\/\.github\/actions\/[^/.][^/]*(\/|$)/;
const ehLocal = (alvo) => alvo === './' || (LOCAL.test(alvo) && !alvo.split('/').includes('..'));
const FIXADA = /@[0-9a-f]{40}$/;
const CHECKOUT = /^actions\/checkout@/i;
const semCredencial = (passo) =>
  passo.with?.['persist-credentials'] === false || passo.with?.['persist-credentials'] === 'false';

const SCRIPT_GITHUB = /^\.github\/.+\.sh$/i;
const IMAGEM_FIXADA = /@sha256:[0-9a-f]{64}$/;
const OPCOES_SEM_VALOR = new Set([
  '--rm',
  '-i',
  '-t',
  '-it',
  '-ti',
  '-d',
  '-q',
  '--init',
  '--interactive',
  '--tty',
  '--detach',
  '--quiet',
  '--read-only',
  '--privileged',
]);

const arquivos = arquivosVersionados(RAIZ, (c) => CAMINHO_ACAO.test(c) || SCRIPT_GITHUB.test(c) || c === PNPM);
const achados = [];

function conferirPolitica(caminho, documento) {
  const p = documento && typeof documento === 'object' ? documento : {};
  if (p.blockExoticSubdeps !== true) achados.push(`${caminho}:1: falta blockExoticSubdeps (ausente ou desligado)`);
  if (typeof p.trustPolicy !== 'string' || p.trustPolicy === 'off' || p.trustPolicy === '') {
    achados.push(`${caminho}:1: falta trustPolicy (ausente ou desligado)`);
  }
  if (!(Number.isInteger(p.minimumReleaseAge) && p.minimumReleaseAge > 0)) {
    achados.push(`${caminho}:1: falta minimumReleaseAge (ausente ou desligado)`);
  }
}

function conferirImagem(caminho, texto, imagem, origem) {
  if (typeof imagem !== 'string' || !IMAGEM_FIXADA.test(imagem)) {
    achados.push(`${caminho}:${linhaDe(texto, String(imagem))}: ${String(imagem)} (${origem} sem digest sha256)`);
  }
}

/** Imagem de cada `docker run` do texto de shell (comentários fora, linhas continuadas com `\` juntas). */
function imagensDockerRun(shell) {
  const imagens = [];
  const logico = shell
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ');
  for (const linha of logico.split('\n')) {
    for (const achado of linha.matchAll(/\bdocker\s+run\s+(.*)/g)) {
      const tokens = achado[1].split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));
      let i = 0;
      while (i < tokens.length && tokens[i].startsWith('-')) {
        i += OPCOES_SEM_VALOR.has(tokens[i]) || tokens[i].includes('=') ? 1 : 2;
      }
      imagens.push(tokens[i] ?? '(imagem ausente)');
    }
  }
  return imagens;
}

function conferirJobs(caminho, texto, documento) {
  const jobs = documento && typeof documento === 'object' && documento.jobs;
  if (!jobs || typeof jobs !== 'object') return;
  for (const job of Object.values(jobs)) {
    if (!job || typeof job !== 'object') continue;
    if (job.container !== undefined) {
      conferirImagem(caminho, texto, job.container?.image ?? job.container, 'container');
    }
    for (const servico of Object.values(job.services ?? {})) {
      conferirImagem(caminho, texto, servico?.image ?? servico, 'service');
    }
  }
}

for (const { caminho, texto } of arquivos) {
  if (SCRIPT_GITHUB.test(caminho.replaceAll('\\', '/'))) {
    for (const imagem of imagensDockerRun(texto)) conferirImagem(caminho, texto, imagem, 'docker run');
    continue;
  }
  const { documento, erro } = lerYaml(texto);
  if (erro) {
    achados.push(`${caminho}:1: YAML ilegível (${erro})`);
    continue;
  }
  if (caminho === PNPM) {
    conferirPolitica(caminho, documento);
    continue;
  }
  conferirJobs(caminho, texto, documento);
  percorrerMapas(documento, (mapa) => {
    if (typeof mapa.run === 'string') {
      for (const imagem of imagensDockerRun(mapa.run)) conferirImagem(caminho, texto, imagem, 'docker run');
    }
    if (!('uses' in mapa)) return;
    const alvo = mapa.uses;
    if (typeof alvo !== 'string') {
      achados.push(`${caminho}:1: uses que não é texto`);
      return;
    }
    if (!ehLocal(alvo) && !FIXADA.test(alvo))
      achados.push(`${caminho}:${linhaDe(texto, alvo)}: ${alvo} (sem SHA de 40 caracteres)`);
    if (CHECKOUT.test(alvo) && !semCredencial(mapa)) {
      achados.push(`${caminho}:${linhaDe(texto, alvo)}: ${alvo} sem persist-credentials: false`);
    }
  });
}
if (!arquivos.some((a) => a.caminho === PNPM)) achados.push(`${PNPM}:1: arquivo ausente`);
encerrar(
  achados,
  'action sem SHA, imagem Docker sem digest, checkout com credencial persistida ou política do pnpm ausente (G-24)',
);
