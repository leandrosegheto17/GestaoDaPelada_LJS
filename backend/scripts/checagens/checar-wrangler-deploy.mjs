import { arquivosVersionados, encerrar } from './arquivos.mjs';
import { lerYaml, linhaDe, percorrerMapas } from './yaml-estrutura.mjs';

// G-15: o deploy só acontece no workflow `deploy.yml` (depois do dump e da migração). Nenhum outro arquivo
// executável pode publicar com o wrangler (`deploy`, `versions|pages|triggers deploy`, `publish`) nem usar a action
// `cloudflare/wrangler-action` nem `cloudflare/pages-action`. Varre scripts, workflows, Dockerfile, Makefile, justfile,
// .ps1/.cmd/.bat/.py; Markdown (DEPLOY.md) não é varrido. Workflows (`.github/**/*.yml`) e `package.json` são lidos pelo
// parser do formato (comandos de `run:` e de `scripts`, valores de `uses:`): comentário e texto que não é comando não
// contam, e um `run: |` com barra invertida é lido como o shell lê. O resto é texto.
// Risco residual aceito: ofuscação deliberada (bloco `run: |` com `wrangler` e `deploy` em linhas separadas, `$VAR`,
// array de argumentos, base64) não é detectada; o controle real é a revisão de PR e o disparo manual do deploy restrito à main (branch policy do environment `producao`).
const RAIZ = process.argv[2] ?? process.cwd();
const FORA =
  /^(\.md|\.claude)\/|\/node_modules\/|^\.github\/workflows\/deploy\.yml$|^backend\/scripts\/checagens\/(checar-wrangler-deploy\.mjs|test\/checar-wrangler-deploy\.test\.mjs)$/;
const EXECUTAVEL =
  /(^\.github\/.*\.ya?ml$)|(^|\/)package\.json$|\.(sh|js|mjs|cjs|ts|ps1|cmd|bat|py)$|(^|\/)(Dockerfile(\.[^/]*)?|[^/]*\.Dockerfile|(GNU)?Makefile|justfile)$/i;
// Aceita flags globais (e o valor delas) entre `wrangler` e o subcomando: `wrangler -c x.jsonc deploy`.
// Subcomandos de publicação: `deploy`, `versions|pages|triggers deploy` e o alias legado `publish`.
// O valor de uma flag pode vir entre aspas (`--config "a b"`).
const DEPLOY =
  /\bwrangler(?:@[\w.^~<>=*-]+|\.(?:cmd|exe))?(?:\s+-\S+(?:\s+(?:"[^"]*"|'[^']*'|[^\s"'-]\S*))?)*\s+(?:(?:versions|pages|triggers)\s+)?(?:deploy|publish)\b/;
const ACAO_TEXTO = /\buses:\s*["']?cloudflare\/(?:wrangler|pages)-action\b/;
const ACAO_VALOR = /^cloudflare\/(?:wrangler|pages)-action\b/i;
const CONTINUA = /\\\s*$/;
const CONTINUACAO = /\\\s*\r?\n\s*/g;
const WORKFLOW = /^\.github\/.*\.ya?ml$/i;
const PACOTE = /(^|\/)package\.json$/i;

/** Comandos e ações de um workflow ou package.json, lidos da estrutura: `{ comandos, acoes }` ou `{ erro }`. */
function lerEstruturado(caminho, texto) {
  const { documento, erro } = lerYaml(texto);
  if (erro) return { erro };
  const comandos = [];
  const acoes = [];
  percorrerMapas(documento, (mapa) => {
    if (typeof mapa.run === 'string') comandos.push(mapa.run);
    if (typeof mapa.uses === 'string') acoes.push(mapa.uses);
    if (PACOTE.test(caminho) && mapa.scripts && typeof mapa.scripts === 'object') {
      comandos.push(...Object.values(mapa.scripts).filter((v) => typeof v === 'string'));
    }
  });
  return { comandos, acoes };
}

const arquivos = arquivosVersionados(RAIZ, (c) => EXECUTAVEL.test(c) && !FORA.test(c));
const achados = [];
for (const { caminho, texto } of arquivos) {
  if (WORKFLOW.test(caminho) || PACOTE.test(caminho)) {
    const lido = lerEstruturado(caminho, texto);
    if (lido.erro) {
      achados.push(`${caminho}:1: arquivo ilegível (${lido.erro})`);
      continue;
    }
    for (const comando of lido.comandos) {
      for (const linha of comando.replace(CONTINUACAO, ' ').split(/\r?\n/)) {
        if (DEPLOY.test(linha)) {
          achados.push(`${caminho}:${linhaDe(texto, linha.trim().slice(0, 30))}: ${linha.trim().slice(0, 120)}`);
        }
      }
    }
    for (const acao of lido.acoes) {
      if (ACAO_VALOR.test(acao)) achados.push(`${caminho}:${linhaDe(texto, acao)}: uses: ${acao}`);
    }
    continue;
  }
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i += 1) {
    // Junta as linhas quebradas com a barra invertida para pegar `wrangler \` seguido de `deploy`.
    let junta = linhas[i];
    let j = i;
    while (CONTINUA.test(junta) && j + 1 < linhas.length) {
      j += 1;
      junta = `${junta.replace(CONTINUA, '')} ${linhas[j].trim()}`;
    }
    if (DEPLOY.test(junta) || ACAO_TEXTO.test(junta))
      achados.push(`${caminho}:${i + 1}: ${linhas[i].trim().slice(0, 120)}`);
  }
}
encerrar(achados, 'publicação com wrangler fora de .github/workflows/deploy.yml (G-15)');
