import { join } from 'node:path';
import { arquivosDoRepositorio, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `plano-unico` (T8; PLA-01): o plano só se decide no domínio (`backend/dominio/src/plano/`), pela
 * `planoEfetivo`. Fora dele, das migrações e dos testes, reprova:
 *
 * - comparação com `uso_proprio`, `inadimplente` ou `cancelado` (`===`, `!==`, `==`, `!=` ou `case`) em qualquer código
 *   do backend ou do front;
 * - comparação de algo chamado `situacao…` com `trial` ou `ativo` no backend (`backend/api/src/`, `backend/dominio/src/`).
 *   No front, `trial` é também o nome do plano efetivo e `ativo` a situação do jogador, então lá a regra não vale;
 *   no backend, a situação do jogador sai de `fim === null`, não de comparar texto;
 * - SQL que filtra por `situacao_comercial` (`= …`, `<> …`, `IN (…)`) fora das migrações;
 * - `planoEfetivo` declarado de novo (`function planoEfetivo` ou `const planoEfetivo =`).
 *
 * Os valores são montados por partes, para este arquivo e o teste passarem sobre si mesmos.
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');

export const PASTA_DO_PLANO = 'backend/dominio/src/plano/';
export const PASTA_MIGRACOES = 'backend/api/src/infraestrutura/db/migracoes/';

const PASTAS_BACKEND: readonly string[] = ['backend/api/src/', 'backend/dominio/src/'];
const PASTAS_TODAS: readonly string[] = [...PASTAS_BACKEND, 'frontend/web/src/', 'backend/contrato/src/'];

const SO_DA_SITUACAO = ['uso_' + 'proprio', 'inadim' + 'plente', 'cance' + 'lado'].join('|');
const AMBIGUOS = ['tri' + 'al', 'ati' + 'vo'].join('|');
const COLUNA = 'situacao_' + 'comercial';
const FUNCAO = 'plano' + 'Efetivo';

const COMPARA = String.raw`(?:===|!==|==|!=)`;

const RE_SO_DA_SITUACAO = new RegExp(
  String.raw`${COMPARA}\s*['"\`](?:${SO_DA_SITUACAO})['"\`]|['"\`](?:${SO_DA_SITUACAO})['"\`]\s*${COMPARA}|\bcase\s+['"\`](?:${SO_DA_SITUACAO})['"\`]`,
);
const RE_AMBIGUO = new RegExp(
  String.raw`\bsituacao\w*\b[^;]*?${COMPARA}\s*['"\`](?:${AMBIGUOS})['"\`]|['"\`](?:${AMBIGUOS})['"\`]\s*${COMPARA}\s*[\w.?]*situacao`,
  'i',
);
const RE_SQL = new RegExp(String.raw`\b${COLUNA}\b\s*(?:=|<>|!=|\bIN\b|\bNOT\s+IN\b)`, 'i');
const RE_FUNCAO = new RegExp(String.raw`\bfunction\s+${FUNCAO}\b|\b(?:const|let|var)\s+${FUNCAO}\s*=`);

function emAlguma(caminho: string, pastas: readonly string[]): boolean {
  return pastas.some((p) => caminho.startsWith(p));
}

function ehTeste(caminho: string): boolean {
  return /\/(test|tests|e2e|__tests__)\//.test(caminho) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(caminho);
}

/** Uma linha por ocorrência: `caminho:linha: <motivo>`. */
export function checarPlanoUnico(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho: bruto, conteudo } of arquivos) {
    const caminho = bruto.replace(/\\/g, '/');
    if (!emAlguma(caminho, PASTAS_TODAS)) continue;
    if (caminho.startsWith(PASTA_DO_PLANO) || caminho.startsWith(PASTA_MIGRACOES) || ehTeste(caminho)) continue;
    if (conteudo.includes('\u0000')) continue;
    const backend = emAlguma(caminho, PASTAS_BACKEND);
    conteudo.split('\n').forEach((linha, i) => {
      const onde = `${caminho}:${i + 1}`;
      if (RE_SO_DA_SITUACAO.test(linha) || (backend && RE_AMBIGUO.test(linha))) {
        problemas.push(`${onde}: compara a situação comercial; o plano só se decide pela ${FUNCAO} (PLA-01)`);
      }
      if (RE_SQL.test(linha)) {
        problemas.push(`${onde}: filtra por ${COLUNA} no SQL; leia a situação e chame a ${FUNCAO} (PLA-01)`);
      }
      if (RE_FUNCAO.test(linha)) {
        problemas.push(`${onde}: declara ${FUNCAO} fora de ${PASTA_DO_PLANO} (PLA-01)`);
      }
    });
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarPlanoUnico(arquivosDoRepositorio(RAIZ));
  for (const p of problemas) console.error(`plano-unico: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
