import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Resultado {
  ok: boolean;
  violacoes: string[];
}

const RAIZ = join(import.meta.dirname, '..', '..', '..');

/** Os dois arquivos que decidem para onde o deploy publica (FUN-28, AD-004, AD-119). */
const ARQUIVOS = ['wrangler.jsonc', '.github/workflows/deploy.yml'];

interface Regra {
  teste: RegExp;
  motivo: string;
}

const REGRAS: Regra[] = [
  {
    // O Worker de produção se chama `gestaodapelada`; a prévia, `gestaodapelada-v2`.
    teste: /gestaodapelada(?!-v2)/i,
    motivo: 'menciona o Worker de produção "gestaodapelada" (a prévia é gestaodapelada-v2)',
  },
  {
    teste: /["']?\b(?:routes?|custom_domain)\b["']?\s*:/,
    motivo: 'configura rota ou domínio próprio (routes, route, custom_domain)',
  },
  { teste: /--(?:routes?|custom-domain)\b/, motivo: 'passa rota ou domínio próprio por flag' },
];

/** Tira o comentário de fim de linha (`// ...` no JSONC, `# ...` no YAML), para não reprovar prosa. */
function semComentario(linha: string, caminho: string): string {
  const marca = caminho.endsWith('.yml') ? /(^|\s)#.*$/ : /(^|\s)\/\/.*$/;
  return linha.replace(marca, '');
}

/**
 * Enquanto a v2 não assumiu a produção, o deploy só alcança a prévia: nenhuma menção ao Worker `gestaodapelada` sem
 * `-v2`, nenhuma rota nem domínio próprio no `wrangler.jsonc` e no `deploy.yml` (FUN-28). O environment `producao`
 * é permitido (AD-119): é onde moram os secrets.
 */
export function checarSoPrevia(op: { raiz: string }): Resultado {
  const violacoes: string[] = [];
  for (const caminho of ARQUIVOS) {
    const arquivo = join(op.raiz, caminho);
    if (!existsSync(arquivo)) continue;
    readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .forEach((linha, i) => {
        const util = semComentario(linha, caminho);
        for (const regra of REGRAS) {
          if (regra.teste.test(util)) violacoes.push(`${caminho}:${i + 1}: ${regra.motivo}`);
        }
      });
  }
  return { ok: violacoes.length === 0, violacoes };
}

if (import.meta.main) {
  const r = checarSoPrevia({ raiz: RAIZ });
  if (r.ok) {
    console.log('só a prévia: ok');
  } else {
    console.error(r.violacoes.join('\n'));
    process.exit(1);
  }
}
