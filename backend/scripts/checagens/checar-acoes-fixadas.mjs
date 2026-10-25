import { arquivosVersionados, encerrar } from './arquivos.mjs';
import { lerYaml, linhaDe, percorrerMapas } from './yaml-estrutura.mjs';

// G-24: toda action de terceiros em workflow ou action composta é fixada por SHA de commit (40 hex), todo
// `actions/checkout` desliga a credencial persistida (`persist-credentials: false`) e o pnpm-workspace.yaml
// mantém a política de cadeia de suprimentos. Action local só vale dentro de `./.github/actions/` (ou `./`),
// sem segmento `..`. Os arquivos são lidos com o parser de YAML (não por linha de texto), então estilo flow,
// aspas e comentários não escondem um `uses`.
// O valor de `minimumReleaseAge` não é fixado aqui; só que seja um número maior que zero.
const RAIZ = process.argv[2] ?? process.cwd();
const CAMINHO_ACAO = /^\.github\/(workflows\/[^/]+\.ya?ml|actions\/[^/]+\/action\.ya?ml)$/i;
const PNPM = 'pnpm-workspace.yaml';
const LOCAL = /^\.\/\.github\/actions\/[^/.][^/]*(\/|$)/;
const ehLocal = (alvo) => alvo === './' || (LOCAL.test(alvo) && !alvo.split('/').includes('..'));
const FIXADA = /@[0-9a-f]{40}$/;
const CHECKOUT = /^actions\/checkout@/i;
const semCredencial = (passo) =>
  passo.with?.['persist-credentials'] === false || passo.with?.['persist-credentials'] === 'false';

const arquivos = arquivosVersionados(RAIZ, (c) => CAMINHO_ACAO.test(c) || c === PNPM);
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

for (const { caminho, texto } of arquivos) {
  const { documento, erro } = lerYaml(texto);
  if (erro) {
    achados.push(`${caminho}:1: YAML ilegível (${erro})`);
    continue;
  }
  if (caminho === PNPM) {
    conferirPolitica(caminho, documento);
    continue;
  }
  percorrerMapas(documento, (mapa) => {
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
encerrar(achados, 'action sem SHA, checkout com credencial persistida ou política do pnpm ausente (G-24)');
