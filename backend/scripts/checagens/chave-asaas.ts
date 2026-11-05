import { arquivosDoRepositorio, RAIZ, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `chave-asaas` (planos-e-cobranca T40; PLA-37): nenhuma chave da API do Asaas no repositório. As chaves
 * começam pelo prefixo `$aact_` seguido de um texto longo em base64 (com `prod_` ou `hmlg_` nas mais novas); o
 * `.env.example` traz só o nome (`ASAAS_API_KEY=`). A mesma regra está no `.gitleaks.toml`, que varre também o
 * histórico no CI.
 *
 * O prefixo é montado por partes, para este arquivo e o teste não reprovarem a si mesmos.
 */

const PREFIXO = ['\\$', 'aa', 'ct_'].join('');

/** O prefixo seguido de pelo menos 40 caracteres de chave. */
export const RE_CHAVE_ASAAS = new RegExp(`${PREFIXO}[A-Za-z0-9+/=_-]{40,}`);

/** Uma linha por ocorrência: `caminho:linha: <motivo>`. O valor encontrado nunca é impresso. */
export function checarChaveAsaas(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho: bruto, conteudo } of arquivos) {
    const caminho = bruto.replace(/\\/g, '/');
    if (conteudo.includes('\u0000')) continue;
    conteudo.split('\n').forEach((linha, i) => {
      if (RE_CHAVE_ASAAS.test(linha)) {
        problemas.push(
          `${caminho}:${i + 1}: parece uma chave da API do Asaas; segredo só no secret do Worker (PLA-37)`,
        );
      }
    });
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarChaveAsaas(arquivosDoRepositorio(RAIZ));
  for (const p of problemas) console.error(`chave-asaas: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
