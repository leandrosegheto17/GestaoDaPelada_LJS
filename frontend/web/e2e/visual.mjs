import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarMapa, nomesValidos } from './config-fundacao.mjs';
import { lerTelasAtivas } from './telas-ativas.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PACOTE = join(AQUI, '..');
const RAIZ = join(PACOTE, '../..');
const PASTA_MOCKUP = join(RAIZ, '.specs/mockup');
const SAIDA = join(AQUI, 'resultado');
const SCRIPT = join(AQUI, 'ferramentas/comparar-visual.mjs');
// Porta própria (não a 4173 padrão do `vite preview`), para não colidir com outro preview aberto na máquina.
const PORTA = process.env.VISUAL_PORTA ?? '4183';
const DIST_VISUAL = process.env.DIST_VISUAL ?? join(PACOTE, 'dist-visual');

function falhar(mensagem) {
  console.error(mensagem);
  process.exit(2);
}

const mapa = JSON.parse(readFileSync(join(PASTA_MOCKUP, 'telas.json'), 'utf8'));
const indice = process.argv.indexOf('--tela');
let telas;
try {
  telas =
    indice >= 0
      ? lerTelasAtivas((process.argv[indice + 1] ?? '').replaceAll(',', '\n'), nomesValidos(mapa))
      : lerTelasAtivas(
          readFileSync(process.env.TELAS_ATIVAS_ARQUIVO ?? join(AQUI, 'telas-ativas.txt'), 'utf8'),
          nomesValidos(mapa),
        );
} catch (erro) {
  falhar(erro.message);
}

if (telas.length === 0) {
  console.log('Nenhuma tela ativa: nada a comparar.');
  process.exit(0);
}

// O build de teste (com as rotas de vitrine) vai para uma pasta própria, nunca para o `dist` que o Worker publica.
if (!process.env.VISUAL_SEM_BUILD) {
  const build = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', DIST_VISUAL, '--emptyOutDir'], {
    cwd: PACOTE,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VITE_VITRINE: '1' },
  });
  if (build.status !== 0) falhar('O build de teste (VITE_VITRINE=1) falhou.');
}
if (!existsSync(DIST_VISUAL)) falhar('dist-visual/ ausente: rode o build de teste (VITE_VITRINE=1) antes.');

mkdirSync(SAIDA, { recursive: true });
const arquivoMapa = join(SAIDA, 'telas-fundacao.json');
try {
  writeFileSync(arquivoMapa, JSON.stringify(montarMapa(mapa, telas, PASTA_MOCKUP, SAIDA), null, 2));
} catch (erro) {
  falhar(erro.message);
}

const resultado = spawnSync(
  process.execPath,
  [
    SCRIPT,
    '--config',
    arquivoMapa,
    '--pacote',
    PACOTE,
    '--base-url',
    `http://localhost:${PORTA}`,
    '--iniciar',
    `pnpm exec vite preview --outDir "${DIST_VISUAL}" --port ${PORTA} --strictPort`,
    '--saida',
    SAIDA,
    '--limite',
    '1',
  ],
  { cwd: PACOTE, stdio: 'inherit' },
);
process.exit(resultado.status ?? 1);
